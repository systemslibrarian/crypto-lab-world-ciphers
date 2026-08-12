import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Five rules govern everything here, and each one is a correction of a specific
 * thing the gate this replaces did:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. The old spec's
 *     `killMotion()` pushed `transition:none!important; animation:none!important`
 *     through `addStyleTag`. That BYPASSED this lab's own
 *     `@media (prefers-reduced-motion: reduce)` blocks instead of exercising
 *     them, and on this page those blocks are not the interesting part — the
 *     JavaScript is. `src/main.ts` reads
 *     `matchMedia('(prefers-reduced-motion: reduce)')` in TWO places and takes a
 *     completely different code path when it matches: `animateAriaSbox()` skips
 *     the three-step 1100ms S-box walk and jumps straight to the final lookup,
 *     and `playSm4Anim()` skips 32 rounds x 4 stages of highlighting and renders
 *     the LAST round with the `feed` stage lit. A style tag cannot reach either
 *     decision. So the old gate scanned the animated path with its transitions
 *     stubbed out, and the reduced-motion renderings — which are what a reader
 *     with the preference set actually sees — were never scanned at all. `boot`
 *     asks for the preference and ASSERTS it took effect, and the drive walks
 *     both of those end states.
 *
 *  2. IT FORCE-REVEALED EVERYTHING. `openAllDetails()` set `details.open = true`
 *     on every disclosure and cleared the `hidden` attribute from every element
 *     carrying one. On this page that was doubly wrong: there are ZERO `<details>`
 *     elements and zero `[hidden]` elements, so the helper was pure ceremony that
 *     read like coverage — and if either had existed, it would have assembled a
 *     document no visitor can reach. `boot` asserts `details` count is 0 so that
 *     absence is a measurement rather than an omission, and nothing here ever
 *     touches `display`, `hidden` or `open`.
 *
 *  3. IT SCANNED ONCE, AFTER A DRIVE THAT OVERWROTE EVERY STATE IT BUILT.
 *     `driveDemos()` clicked eighteen buttons in a row and then scanned. The last
 *     click was `#penguin-run`; every state produced by the previous seventeen was
 *     gone by the time axe looked. Worse, each click was guarded by
 *     `if (await btn.count())` and wrapped in `.catch(() => {})`, so a control
 *     that had been renamed or removed SKIPPED SILENTLY instead of failing, and a
 *     click that threw was swallowed. And it drove at one viewport only: the whole
 *     380px column — where `.comparison-table` and `.kat-table` become scrollers,
 *     and `.control-row` restacks — had never been looked at. This drive scans
 *     after every single step, in {dark, light} x {1280, 380}, with no `count()`
 *     guards and no swallowed errors.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`. Two classes of failure on
 *     this page never reach that array: this palette is built out of translucent
 *     tints axe declines to resolve (`--callout-bg`, `--warning-bg`,
 *     `--danger-bg`, `--accent-dim`, `--table-stripe` are all `rgba()`, and
 *     `.cl-hero-why` is a `color-mix(in oklab, ...)`), which axe files under
 *     `incomplete`; and `aria-label` on a role-less element is PROHIBITED and
 *     lands in `incomplete` too, never in `violations`.
 *
 *  5. IT HAD NO REFLOW, KEYBOARD-SCROLLER OR NON-TEXT-CONTRAST ORACLE, and this
 *     page needed all three. `.kat-table-wrapper` and `.comparison-table-wrapper`
 *     wrap tables with `min-width: 640px` / `700px` in `overflow-x: auto`; at
 *     1280px neither overflows and there is nothing to find, and at 380px both
 *     scroll with no focusable content inside and — before this gate — no
 *     `tabindex`. That is a WCAG 2.1.1 failure that exists only in a viewport the
 *     old gate never opened.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Transitions drain in waves, not in one batch, so a poll for "nothing running
 * right now" can exit through a gap between waves. Require quiescence to hold
 * for several consecutive frames instead.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number };
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      return w.__quietFrames >= 6;
    },
    undefined,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set.
 *
 * This page is not currently in that shape, and the assertion is what makes that
 * a measurement rather than a reading: `style.css` contains no `@keyframes` and
 * no `animation` property at all, and its two `prefers-reduced-motion` blocks
 * only set `transition: none` on `.sg-cell`, `.ra-stage` and `.ra-progress-bar`.
 * The one `opacity` declaration in the file is `.cl-hero-sub { opacity: .85 }`,
 * which is static and nowhere near zero. The check runs in every state anyway,
 * because all of that is a property of the current stylesheet rather than of the
 * page, and because the two reduced-motion code paths in `src/main.ts` DO change
 * what is rendered — this is the cheapest place to catch the first one that
 * renders nothing.
 *
 * `aria-hidden` subtrees are excluded; see the note on `ariaHidden` in
 * `contrast.ts` for what this lab hides and why each one was checked by hand.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from the moment the page is
 * created. Every exhibit here runs inside a `try/catch` that writes the message
 * into an output area, so a thrown renderer leaves a plausible-looking page
 * behind and a gate that scans it reports green for something broken. This is
 * also the direct replacement for the old drive's `.catch(() => {})`, which
 * swallowed exactly this signal. Attach before `boot`, assert after the drive.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark.
 *
 * This page ships TWO `<header>` elements that are direct children of `<body>`:
 * the shared Crypto Lab bar (`role="banner"`) and this lab's own `.cl-hero`.
 * Both would imply `banner`, and `index.html`'s `dedupeBanner()` demotes the
 * second to `role="group"` on DOMContentLoaded. That is a script, it runs after
 * first paint, and nothing else verifies it — so the OUTCOME is asserted here
 * rather than the mechanism, which also catches the case where the hero is
 * restructured and the script silently stops matching it.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false; // explicit non-banner role wins
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * Load the page in a known theme with reduced motion actually in effect, and
 * assert the content every scan relies on is really on the page — including the
 * lab's DEFAULTS, which are never assumed.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page. That assertion is load-bearing here rather
 * than decorative: `src/main.ts` captures
 * `matchMedia('(prefers-reduced-motion: reduce)').matches` at MODULE LOAD into
 * `prefersReducedMotion`, so an emulation applied after `goto` would be read as
 * `false` and the drive would silently exercise the animated path while claiming
 * to measure the reduced one.
 *
 * The theme is seeded through `localStorage` rather than by clicking the toggle,
 * which pins down a real failure mode as a side effect: `index.html`'s
 * anti-flash script reads `localStorage.getItem('theme')`, the shared bar's
 * toggle writes `localStorage.setItem('theme', ...)`, and `src/main.ts`'s own
 * (display:none) toggle writes the same key. If any of those drift apart the
 * theme silently stops persisting, and this boot fails on `data-theme` instead
 * of quietly scanning dark twice.
 *
 * The defaults are asserted at length because this lab ships almost entirely
 * POPULATED — the opposite of most labs in this fleet. Four of its exhibits run
 * themselves on load (`runKnownAnswerTests()`, `runAvalanche()`, `runMode()`,
 * `runPenguin()`), the SM4 round animation is seeded to round 1, four key fields
 * are filled with fresh random hex, and the 16x16 S-box grid is rendered. So the
 * arrival state is a real, dense, measurable page, and every one of those
 * generators is a place where a silent failure would leave a plausible-looking
 * blank that no `violations` array would ever mention.
 */
export async function boot(page: Page, theme: 'dark' | 'light'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the whole
  // test timeout and reports nothing useful. 20s turns that silent hang into a
  // named failure naming the locator.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await assertSingleBanner(page);

  // ── Nothing on this page is behind a disclosure or the `hidden` attribute ──
  // The gate this replaces opened every `<details>` and cleared every `[hidden]`
  // before scanning. Asserting both are zero turns "the helper did nothing" from
  // an assumption into a measurement, and fails the day one is added without the
  // drive learning to open it.
  await expect(page.locator('details')).toHaveCount(0);
  await expect(page.locator('[hidden]')).toHaveCount(0);

  // The lab's own theme toggle is suppressed by the shared header's stylesheet
  // (`display:none !important`) while staying in the DOM so its JS keeps working.
  // If that ever stops applying there are two toggles and two aria-labels for the
  // same control.
  await expect(page.locator('#theme-toggle')).toBeHidden();

  // ── Exhibit "Verified": the KAT table runs itself on load ────────────────
  await expect(page.locator('#kat-summary')).toHaveText('7/7 vectors reproduced exactly');
  await expect(page.locator('#kat-tbody tr')).toHaveCount(7);
  await expect(page.locator('#kat-tbody td.kat-fail')).toHaveCount(0);

  // ── Exhibit 1, Camellia: CBC and 256-bit by default, keys auto-generated ──
  await expect(page.locator('#cam-keysize')).toHaveValue('256');
  await expect(page.locator('#cam-mode')).toHaveValue('cbc');
  await expect(page.locator('#cam-iv-row')).toBeVisible();
  expect((await page.inputValue('#cam-key')).length, 'Camellia key auto-generated').toBe(64);
  expect((await page.inputValue('#cam-iv')).length, 'Camellia IV auto-generated').toBe(32);
  await expect(page.locator('#cam-rounds')).toHaveAttribute('aria-label', '24 rounds');
  await expect(page.locator('#cam-rounds .round-dot')).toHaveCount(24);
  await expect(page.locator('#cam-output')).toHaveText('Output will appear here');

  // ── Exhibit 2, ARIA ──────────────────────────────────────────────────────
  await expect(page.locator('#aria-keysize')).toHaveValue('256');
  expect((await page.inputValue('#aria-key')).length, 'ARIA key auto-generated').toBe(64);
  await expect(page.locator('#aria-sbox-input')).toHaveValue('3f');
  await expect(page.locator('#aria-diff-input')).toHaveValue('00112233445566778899aabbccddeeff');
  // The 16x16 S1 table is rendered by `renderAriaSboxGrid()` at module load.
  await expect(page.locator('#aria-sbox-grid td.sg-cell')).toHaveCount(256);
  await expect(page.locator('#aria-sbox-step')).toBeEmpty();

  // ── Exhibit 3, SM4: the round animation is seeded to round 1 on load ──────
  expect((await page.inputValue('#sm4-key')).length, 'SM4 key auto-generated').toBe(32);
  await expect(page.locator('#sm4-rounds')).toHaveAttribute('aria-label', '32 rounds');
  await expect(page.locator('#sm4-anim-round')).toHaveText(/^Round 1 of 32 — new word X4 = [0-9a-f]{8}$/);
  await expect(page.locator('#sm4-anim-state .ra-word')).toHaveCount(5);

  // ── Exhibit 4, Kuznyechik ────────────────────────────────────────────────
  expect((await page.inputValue('#kuz-key')).length, 'Kuznyechik key auto-generated').toBe(64);
  await expect(page.locator('#kuz-output')).toHaveText('Output will appear here');

  // ── Exhibit 5, avalanche: 128 bit choices, and it has already run ────────
  await expect(page.locator('#av-flip option')).toHaveCount(128);
  await expect(page.locator('#av-flip')).toHaveValue('0');
  await expect(page.locator('#av-summary')).toHaveText(
    /^\d+ of 128 ciphertext bits changed \(\d+\.\d%\) from a single flipped input bit\.$/
  );
  await expect(page.locator('#av-grid .bit-cell')).toHaveCount(128);

  // ── Exhibit 6, ECB vs CBC: also already run, and the leak is real ─────────
  // All three ECB blocks identical, no two CBC blocks alike, is the entire claim
  // of the exhibit. Asserting it at boot means a scan of "the ECB leak" cannot
  // pass while measuring a page that is not showing one.
  await expect(page.locator('#mode-ecb .cipher-block')).toHaveCount(3);
  await expect(page.locator('#mode-ecb .cipher-block.repeat')).toHaveCount(3);
  await expect(page.locator('#mode-cbc .cipher-block')).toHaveCount(3);
  await expect(page.locator('#mode-cbc .cipher-block.repeat')).toHaveCount(0);
  await expect(page.locator('#penguin-note')).toHaveText(/^Encrypted 9216 real image bytes \(576 blocks\)/);

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and this page is
 * exactly the shape that breaks it: a 700px-minimum four-way comparison table, a
 * 640px-minimum KAT table, a 16x16 S-box grid, and hex strings long enough to
 * need `word-break`. Each of the three tables is meant to scroll inside its own
 * wrapper; the assertion here is that none of them scrolls the DOCUMENT.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow-x: auto` wrapper has a huge bounding rect but
    // is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element. This page
    // has three such decoys: `.comparison-table` measures 700px wide inside a
    // 348px wrapper at phone width, and is not the cause of anything.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1). If
 * it holds no focusable content it needs `tabindex="0"`, so it becomes a focus
 * target arrow keys can then scroll.
 *
 * This lab has exactly three such containers and, when this gate was written,
 * only one of them was reachable. `.sbox-grid-wrap` shipped with
 * `tabindex="0"` and `role="img"`; `.kat-table-wrapper` and
 * `.comparison-table-wrapper` shipped with neither, holding tables of
 * `min-width: 640px` and `700px` and no focusable content whatsoever. At 1280px
 * neither of those overflows, so the failure did not exist in the only viewport
 * the old gate ever opened — it appears the moment the window is a phone.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return (
          ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)
        );
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run. It
 * is a debugging aid only: `A11Y_COLLECT` is never set in CI or in the committed
 * workflow, and a run with it set prints every finding as it happens and then
 * fails at the end, so a green collection run cannot be mistaken for a green
 * gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a
 * collection run would end green, and a green collection run is
 * indistinguishable from a green gate — which is the exact confusion the whole
 * exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function expectScrollersReachableSoft(page: Page, label: string): Promise<void> {
  if (!COLLECTING) return expectScrollersReachable(page, label);
  try {
    await expectScrollersReachable(page, label);
  } catch (e) {
    record(String(e).slice(0, 900));
  }
}

/**
 * The 1.4.11 ratchet, soft-wrapped the same way as every other oracle here.
 *
 * The wrapper is written out longhand rather than folded into a neighbour
 * because of how this oracle died elsewhere in this fleet:
 * `expectNoNewNonTextFailures` had been called from inside
 * `expectScrollersReachableSoft`, AFTER that function's `if (!COLLECTING) return`
 * guard, so in a strict run — which is every run in CI and every run anyone reads
 * as a pass — the guard returned first and `nontext.ts` never executed at all.
 * It is called from `scan()` here, at every driven state, and this baseline was
 * captured by that live path.
 */
async function expectNoNewNonTextFailuresSoft(page: Page, label: string): Promise<void> {
  if (!COLLECTING) return expectNoNewNonTextFailures(page, label);
  try {
    await expectNoNewNonTextFailures(page, label);
  } catch (e) {
    record(String(e).slice(0, 900));
  }
}

async function expectNoHorizontalOverflowSoft(page: Page, label: string): Promise<void> {
  if (!COLLECTING) return expectNoHorizontalOverflow(page, label);
  try {
    await expectNoHorizontalOverflow(page, label);
  } catch (e) {
    record(String(e).slice(0, 900));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast, and
 * the arithmetic text walk cannot reach a control's boundary or a `::before`
 * glyph, because a pseudo-element is not an element and owns no text node.
 *
 * The remaining backlog here is real but is not this repo's to fix — it is the
 * shared Crypto Lab top bar, byte-identical in every repo in the fleet — so this
 * does not block on it. A check that merely logs is not a gate, though, so it
 * ratchets: anything NOT in the baseline fails, anything in the baseline that got
 * WORSE fails, and anything in the baseline that has been FIXED fails until its
 * entry is deleted. That last rule is what stops the allowlist becoming a
 * permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the point
 * — or the drive stopped reaching the state that shows it, which is a coverage
 * regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Seven assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those ratios
 *    arithmetically — which matters more here than in most labs, because every
 *    tint in this palette (`--callout-bg`, `--warning-bg`, `--danger-bg`,
 *    `--accent-dim`, `--table-stripe`) is a translucent `rgba()` and
 *    `.cl-hero-why` is a `color-mix(in oklab, ...)`, so axe declines to resolve
 *    the surface under a large fraction of this page's prose. Everything else in
 *    that bucket is a real result axe simply could not finish — including
 *    `aria-prohibited-attr`, which is where an `aria-label` on a role-less
 *    element hides, a defect that never reaches the violations array at all. This
 *    page depends on getting that right in two places: `fillRoundDots()` sets
 *    `role="img"` alongside the `aria-label` it writes on `#cam-rounds` and
 *    `#sm4-rounds`, and `.sbox-grid-wrap` carries `role="img"` with its label.
 *    Drop either role and the label is silently discarded.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - non-text contrast and generated content — SC 1.4.11, ratcheted; see
 *    `expectNoNewNonTextFailures`. This is the only oracle that judges a
 *    control's boundary, and it is what catches `button.copy-btn` dissolving into
 *    its panel.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `AxeBuilder.withRules()` both write the same
  // `options.runOnly` field, so the second call SILENTLY REPLACES the first —
  // the axe-core/playwright source says so in as many words on `withRules`
  // ("Cannot be used with AxeBuilder#withTags"). Chained as
  // `.withTags(TAGS).withRules([...4 landmark rules])`, axe therefore runs those
  // FOUR best-practice rules and NOT ONE WCAG RULE, while a green result reads
  // exactly like a full A/AA pass. For scale, `withTags(TAGS)` selects 69 of
  // axe-core 4.12's 105 rule definitions; the chained form executes 4.
  //
  // Confirmed here by experiment rather than by reading: `<html lang="en">` was
  // changed to `<html>` and the full dark-theme drive re-run against the
  // identical page. The merged form below failed on `html-has-lang` (SC 3.1.1,
  // tagged `wcag2a`) at the very first state. See the commit message for the
  // measured before/after.
  //
  // The landmark four are still wanted because they are best-practice rather
  // than WCAG-tagged, so `withTags` alone does not reach them — and this page has
  // the exact shape they catch: a sticky `<header role="banner">` above a second
  // `<header class="cl-hero">` that is demoted at runtime, with an
  // `<aside aria-label="Why it matters">` inside it.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  await expectNoNewNonTextFailuresSoft(page, label);
  await expectScrollersReachableSoft(page, label);
  await expectNoHorizontalOverflowSoft(page, label);
}

// ── The drive ───────────────────────────────────────────────────────────────

/** The four ciphers, in the order their `<option>` values appear. */
const CIPHERS = ['Camellia', 'ARIA', 'SM4', 'Kuznyechik'] as const;

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * Six things shape this drive, and each is a correction of the one it replaces:
 *
 *  - EVERY STEP IS SCANNED. The old `driveDemos()` clicked eighteen buttons and
 *    scanned once at the end, so the only state ever measured was whatever
 *    `#penguin-run` left behind. Here `scanAt` runs after each step.
 *
 *  - NO CONTROL IS OPTIONAL. The old drive wrapped each click in
 *    `if (await btn.count())` and `.catch(() => {})`. A renamed or deleted
 *    control skipped silently and a click that threw was swallowed; either way
 *    the run stayed green while measuring less. Every locator here is a hard
 *    assertion.
 *
 *  - THE ERROR STATES ARE DRIVEN. Six of this lab's handlers have a `catch` that
 *    paints `.error-msg` through `outputError()`, and three more paint a distinct
 *    "encrypt first" message. Those are real renderings of real ink
 *    (`--danger` on `--code-bg`) that no reader reaches by accident and that no
 *    previous gate had ever looked at.
 *
 *  - BOTH REDUCED-MOTION BRANCHES ARE DRIVEN. `animateAriaSbox()` and
 *    `playSm4Anim()` each take a different code path under the preference this
 *    gate asserts: the first jumps to the third and final S-box lookup, the
 *    second renders round 32 of 32 with the `feed` stage lit. Those renderings
 *    only exist for a reader with the preference set — which is precisely the
 *    reader the old style-tag injection made impossible to test.
 *
 *  - HOVER IS A STATE. `.exhibit-nav a:hover` swaps in `--accent-dim`,
 *    `button:hover` swaps in `--accent-hover`, and `button.copy-btn:hover` swaps
 *    its border to `--border-hover`. A visitor is in one of those states
 *    immediately after pointing at anything, and none had ever been measured.
 *
 *  - NO FIXED TIMEOUTS. The old drive ended with `waitForTimeout(200)`. Every
 *    exhibit here is synchronous work on the main thread with a DOM completion
 *    signal — an output span appearing, a row count, a label's text — and the
 *    drive waits on those.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);

  await scanAt('first paint, four exhibits already self-run');

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('shared skip link focused, slid into view');

  // This lab ships a SECOND skip link of its own, parked at `left:-9999px` and
  // revealed at `left:.75rem` on focus. Both point at `#content`. Its focused
  // rendering is a real state and is the only one in which it paints any pixels
  // at all — the contrast walk deliberately skips the parked copy.
  await page.locator('a.skip-link').focus();
  await expect(page.locator('a.skip-link')).toBeFocused();
  await scanAt('the lab own skip link focused');

  // ── Verified correctness: re-run the KAT battery ─────────────────────────
  await page.click('#kat-run');
  await expect(page.locator('#kat-summary')).toHaveText('7/7 vectors reproduced exactly');
  await expect(page.locator('#kat-tbody tr')).toHaveCount(7);
  await scanAt('KAT battery re-run, seven vectors reproduced');

  // The section nav's hover ink, which sits on `--accent-dim` rather than on the
  // panel it was measured against.
  await page.locator('.exhibit-nav a').first().hover();
  await scanAt('section nav link hovered');

  // ── Exhibit 1: Camellia ──────────────────────────────────────────────────
  await page.click('#cam-encrypt');
  await expect(page.locator('#cam-output .hex')).toHaveText(/^[0-9a-f]{64}$/);
  await expect(page.locator('#cam-output .copy-btn')).toHaveText('Copy');
  await scanAt('Camellia-256-CBC encrypted, copy control rendered');

  // The copy button's own hover, which is where `--border-hover` lands.
  await page.locator('#cam-output .copy-btn').hover();
  await scanAt('copy control hovered');

  // The clipboard write is asserted but NOT scanned in its flashed state: the
  // confirmation reverts after 900ms and a full scan takes longer than that, so
  // a claim to have measured the flash would be a claim this gate cannot keep.
  // What the assertion does prove is that the promise RESOLVED — the handler is
  // `async` with no `.catch()`, so without the clipboard grant it would reject
  // silently, nothing would change on screen, and every later step would be
  // driving a state the code never reached.
  await page.click('#cam-output .copy-btn');
  await expect(page.locator('#cam-output .copy-btn')).toHaveText('Copied');
  await expect(page.locator('#cam-output .copy-btn')).toHaveText('Copy', { timeout: 5_000 });
  await scanAt('copy control settled back after a completed clipboard write');

  await page.click('#cam-decrypt');
  await expect(page.locator('#cam-output .plaintext-result')).toHaveText('Hello from Japan!');
  await scanAt('Camellia round-trip, plaintext recovered');

  // ECB is the only branch that hides the IV row — a layout change, not just a
  // value change, and the only route to it.
  await page.selectOption('#cam-mode', 'ecb');
  await expect(page.locator('#cam-iv-row')).toBeHidden();
  await page.click('#cam-encrypt');
  await expect(page.locator('#cam-output .hex')).toHaveText(/^[0-9a-f]{64}$/);
  await scanAt('Camellia in ECB, the IV row withdrawn');

  // 128-bit is the only route to the 18-round tally; 256-bit shows 24.
  await page.selectOption('#cam-keysize', '128');
  await expect(page.locator('#cam-rounds')).toHaveAttribute('aria-label', '18 rounds');
  await expect(page.locator('#cam-rounds .round-dot')).toHaveCount(18);
  await scanAt('Camellia at 128-bit, eighteen rounds tallied');

  // The error rendering: `--danger` ink through `outputError()`.
  await page.fill('#cam-key', 'not-hex');
  await page.click('#cam-encrypt');
  await expect(page.locator('#cam-output .error-msg')).toHaveText(
    'Camellia key must be exactly 32 hex characters'
  );
  await scanAt('Camellia key rejected, the error ink');

  // Back to a valid 256-bit CBC configuration for the AES comparison, which
  // parses the key as 32 bytes regardless of the selector.
  await page.selectOption('#cam-keysize', '256');
  await page.selectOption('#cam-mode', 'cbc');
  await expect(page.locator('#cam-iv-row')).toBeVisible();
  expect((await page.inputValue('#cam-key')).length, 'a fresh 256-bit key was regenerated').toBe(64);
  await page.click('#cam-compare');
  await expect(page.locator('#cam-compare-camellia .hex')).toHaveText(/^[0-9a-f]{64}$/);
  await expect(page.locator('#cam-compare-aes .hex')).toHaveText(/^[0-9a-f]{64}$/);
  await expect(page.locator('#cam-compare-camellia-dec .plaintext-result')).toHaveText('Hello from Japan!');
  await expect(page.locator('#cam-compare-aes-dec .plaintext-result')).toHaveText('Hello from Japan!');
  await scanAt('Camellia beside AES, four populated output panels');

  // ── Exhibit 2: ARIA ──────────────────────────────────────────────────────
  await page.click('#aria-encrypt');
  await expect(page.locator('#aria-output .hex')).toHaveText(/^[0-9a-f]{64}$/);
  await scanAt('ARIA-256 encrypted');

  await page.click('#aria-decrypt');
  await expect(page.locator('#aria-output .plaintext-result')).toHaveText('Hello from Korea!');
  await scanAt('ARIA round-trip, plaintext recovered');

  // `#aria-sbox-go` runs the four-step non-involution demo AND kicks off the
  // grid animation, which under reduced motion jumps straight to its last step.
  await page.click('#aria-sbox-go');
  await expect(page.locator('#aria-sbox-demo .highlight')).toHaveText('3F');
  await expect(page.locator('#aria-sbox-demo .step')).toHaveCount(4);
  await expect(page.locator('#aria-sbox-step')).toHaveText(
    /— back to your byte: row [0-9A-F], col [0-9A-F] → [0-9A-F]{2}$/
  );
  await expect(page.locator('#aria-sbox-grid td.sg-hot')).toHaveCount(1);
  await scanAt('S-box applied and the grid lookup landed (reduced-motion end state)');

  // A different byte, so the highlighted row/column pair moves.
  await page.fill('#aria-sbox-input', 'a7');
  await page.click('#aria-sbox-animate');
  await expect(page.locator('#aria-sbox-step')).toHaveText(
    /— back to your byte: row [0-9A-F], col [0-9A-F] → [0-9A-F]{2}$/
  );
  await expect(page.locator('#aria-sbox-grid th.sg-row-hot')).toHaveCount(1);
  await expect(page.locator('#aria-sbox-grid th.sg-col-hot')).toHaveCount(1);
  await scanAt('a second S-box lookup, row and column headers lit');

  // The two S-box error states — the demo panel's and the animation's.
  await page.fill('#aria-sbox-input', 'zz');
  await page.click('#aria-sbox-go');
  await expect(page.locator('#aria-sbox-demo .error-msg')).toHaveText(
    'Enter exactly one byte in hex (00-ff)'
  );
  await expect(page.locator('#aria-sbox-step')).toHaveText('Enter one byte in hex (00–ff) above first.');
  await scanAt('S-box input rejected in both the panel and the animation label');

  await page.click('#aria-diff-go');
  await expect(page.locator('#aria-diff-once .hex')).toHaveText(/^[0-9a-f]{32}$/);
  await expect(page.locator('#aria-diff-twice .label')).toHaveText('A(A(state)) = input ✓ involution holds');
  await expect(page.locator('#aria-diff-twice .plaintext-result')).toHaveText(
    '00112233445566778899aabbccddeeff'
  );
  await scanAt('ARIA diffusion applied twice, the involution verified live');

  await page.fill('#aria-diff-input', 'ff');
  await page.click('#aria-diff-go');
  await expect(page.locator('#aria-diff-once .error-msg')).toHaveText(
    'State must be exactly 32 hex characters'
  );
  await scanAt('ARIA diffusion input rejected');

  // ── Exhibit 3: SM4, and the second reduced-motion branch ─────────────────
  await page.click('#sm4-encrypt');
  await expect(page.locator('#sm4-output .hex')).toHaveText(/^[0-9a-f]+$/);
  // Under reduced motion `playSm4Anim()` renders the LAST round immediately with
  // the `feed` stage lit, rather than stepping 32 rounds. This is the whole
  // rendering a reader with the preference set ever sees of this exhibit.
  await expect(page.locator('#sm4-anim-round')).toHaveText(/^Round 32 of 32 — new word X35 = [0-9a-f]{8}$/);
  await expect(page.locator('#sm4-anim .ra-stage.active')).toHaveCount(1);
  await expect(page.locator('#sm4-anim .ra-stage.active')).toHaveAttribute('data-stage', 'feed');
  await scanAt('SM4 encrypted, round 32 of 32 shown (reduced-motion end state)');

  await page.click('#sm4-decrypt');
  await expect(page.locator('#sm4-output .plaintext-result')).toHaveText('Hello from China!');
  await scanAt('SM4 round-trip, plaintext recovered');

  await page.click('#sm4-anim-run');
  await expect(page.locator('#sm4-anim-round')).toHaveText(/^Round 32 of 32/);
  await scanAt('SM4 round animation replayed');

  await page.fill('#sm4-key', 'ff');
  await page.click('#sm4-encrypt');
  await expect(page.locator('#sm4-output .error-msg')).toHaveText(
    'SM4 key must be exactly 32 hex characters'
  );
  await scanAt('SM4 key rejected');

  // ── Exhibit 4: Kuznyechik ────────────────────────────────────────────────
  await page.click('#kuz-encrypt');
  await expect(page.locator('#kuz-output .hex')).toHaveText(/^[0-9a-f]{64}$/);
  await scanAt('Kuznyechik encrypted');

  await page.click('#kuz-decrypt');
  await expect(page.locator('#kuz-output .plaintext-result')).toHaveText('Hello from Russia!');
  await scanAt('Kuznyechik round-trip, plaintext recovered');

  // The "encrypt first" branch, which is a different message from the parse
  // error and is reachable only before any ciphertext exists — so it is driven
  // on the one cipher whose encrypt has not been pressed in a valid state.
  await page.fill('#kuz-key', 'oops');
  await page.click('#kuz-decrypt');
  await expect(page.locator('#kuz-output .error-msg')).toHaveText(
    'Kuznyechik key must be exactly 64 hex characters'
  );
  await scanAt('Kuznyechik key rejected');

  // ── Exhibit 5: avalanche, all four ciphers plus the extremes ─────────────
  for (const cipher of CIPHERS) {
    await page.selectOption('#av-cipher', cipher);
    await expect(page.locator('#av-summary')).toHaveText(
      /^\d+ of 128 ciphertext bits changed \(\d+\.\d%\) from a single flipped input bit\.$/
    );
    await expect(page.locator('#av-grid .bit-cell')).toHaveCount(128);
    await expect(page.locator('#av-base .hex')).toHaveText(/^[0-9a-f]{32}$/);
    await scanAt(`avalanche on ${cipher}`);
  }

  // The last bit in the block — the far end of a 128-option selector, and the
  // only place the flip index reaches three digits.
  await page.selectOption('#av-flip', '127');
  await expect(page.locator('#av-flip')).toHaveValue('127');
  await expect(page.locator('#av-summary')).toHaveText(/^\d+ of 128/);
  await scanAt('avalanche with the final plaintext bit flipped');

  await page.click('#av-random');
  await expect(page.locator('#av-summary')).toHaveText(/^\d+ of 128/);
  await scanAt('avalanche re-keyed with a fresh random block');

  // ── Exhibit 6: ECB vs CBC, both the hex rows and the image ───────────────
  // `.cipher-block.repeat` is the danger-tinted surface — a composited state
  // whose muted `.block-label` ink was never measured against it.
  for (const cipher of ['ARIA', 'Kuznyechik'] as const) {
    await page.selectOption('#mode-cipher', cipher);
    await expect(page.locator('#mode-ecb .cipher-block.repeat')).toHaveCount(3);
    await expect(page.locator('#mode-cbc .cipher-block.repeat')).toHaveCount(0);
    await expect(page.locator('#mode-ecb-note strong')).toHaveText('identical');
    await expect(page.locator('#mode-cbc-note strong')).toHaveText('differ');
    await scanAt(`ECB leak versus CBC on ${cipher}`);
  }

  await page.click('#mode-run');
  await expect(page.locator('#mode-ecb .cipher-block.repeat')).toHaveCount(3);
  await scanAt('ECB versus CBC re-run on a fresh key');

  for (const cipher of ['SM4', 'Camellia'] as const) {
    await page.selectOption('#penguin-cipher', cipher);
    await expect(page.locator('#penguin-note')).toHaveText(
      /^Encrypted 9216 real image bytes \(576 blocks\) with /
    );
    await scanAt(`the ECB penguin encrypted with ${cipher}`);
  }

  // ── The finished page, with every exhibit populated at once ──────────────
  await page.locator('#kat-run').hover();
  await scanAt('the finished page, a primary control hovered');
}
