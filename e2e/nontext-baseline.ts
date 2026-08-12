/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 *
 * What survives here is the SHARED Crypto Lab top bar, and nothing else. Every
 * control inside `<main>`, the hero and the footer is audited with no exemption
 * and comes back clean — including `button.copy-btn`, which was the one real
 * finding this oracle turned up in this repo and which is now fixed in
 * `src/style.css` rather than baselined.
 *
 * `.cl-btn` draws its edge as
 * `1px solid color-mix(in srgb, var(--accent, #35d6bb) 38%, transparent)` over
 * the bar's fixed `#0b1512`. Unlike most labs in this fleet this one DOES define
 * `--accent`, and defines it differently per theme, so the composited edge — and
 * therefore the finding — moves with the theme:
 *
 *   dark   --accent #63b3ed -> edge rgb(44,81,101)  = 2.19:1 against #0b1512
 *   light  --accent #2b6cb0 -> edge rgb(23,54,78)   = 1.48:1 against #0b1512
 *
 * The ratchet stores the worst of the two, because a single key covers both
 * themes and storing the dark figure would let the light one regress unnoticed.
 * Every repo in this fleet carries a byte-identical copy of that markup and CSS,
 * and `CLAUDE.md` is explicit that a change every lab should get is a deliberate
 * reviewed fleet-wide pass and never an overwrite driven from one repo. So it is
 * measured here, ratcheted here, and reported upward.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {
  'control-boundary|a.cl-btn': { ratio: 1.48, required: 3, unverified: false },
  'control-boundary|button#cl-theme-toggle.cl-btn.cl-icon': {
    ratio: 1.48,
    required: 3,
    unverified: false,
  },
};
