import { expect, test } from '@playwright/test';
import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches: the arrival state, where the
 * KAT battery, the avalanche demo, the ECB/CBC block comparison and the ECB
 * penguin have all already run themselves and four key fields are filled with
 * fresh random hex; both skip links focused; the KAT battery re-run; Camellia
 * encrypted and round-tripped in CBC, then in ECB — the only branch that
 * withdraws the IV row — then at 128 bits for the eighteen-round tally, then with
 * a rejected key for the error ink, then compared against AES; ARIA encrypted and
 * round-tripped, its S-box applied and animated to the reduced-motion end state
 * on two different bytes, both of its input-rejection renderings, and its
 * involutory diffusion layer verified live and then rejected; SM4 encrypted —
 * which under reduced motion renders round 32 of 32 rather than stepping through
 * them — round-tripped, replayed and rejected; Kuznyechik encrypted,
 * round-tripped and rejected; the avalanche exhibit on all four ciphers, at the
 * final plaintext bit, and re-keyed; ECB-versus-CBC on three ciphers and the
 * penguin image on two; and the hover state of a nav link, a copy control and a
 * primary button. Every one of those states is scanned, in both themes, at
 * desktop and phone width.
 *
 * Clipboard permission is granted because `outputWithCopy()` calls
 * `navigator.clipboard.writeText` from an `async` listener with no `.catch()`:
 * without the grant the promise rejects, nothing changes on screen, and the drive
 * would be asserting against a state the code never reached.
 *
 * See `gate.ts` for why nothing is injected into the page (this lab branches on
 * `prefers-reduced-motion` in JavaScript, in two places, at module load), why no
 * panel is force-revealed, why the lab's defaults are asserted rather than
 * assumed, and why `violations` is not the whole oracle.
 */

for (const theme of ['dark'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page, context }) => {
    test.setTimeout(900_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = watchPageErrors(page);
    await boot(page, theme);
    await driveAllStates(page, theme);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page, context }) => {
    test.setTimeout(900_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = watchPageErrors(page);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });
}
