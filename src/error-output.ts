/**
 * The error panel, rendered as TEXT.
 *
 * `outputError` wrote its message with
 *
 *     el.innerHTML = `<span class="label">Error</span><span class="error-msg">${message}</span>`
 *
 * and CodeQL flagged it: js/xss-through-exception, src/main.ts:78, raised
 * 2026-10-28. The codeFlow starts at `sm4Plaintext.value` — a text field a visitor
 * types into — follows it into `SM4.encrypt(...)`, catches whatever that throws, and
 * reinterprets `(error as Error).message` as HTML.
 *
 * REACHABILITY. Nothing a visitor types can actually arrive in that message, and the
 * check is worth writing down rather than asserting:
 *
 *   - every `throw` in src/ interpolates a LENGTH, an offset, a label or an element
 *     id — never an input's text (`Hex string has odd length: ${hex.length}`,
 *     `Not hex at offset ${i * 2}`, `${label} must be exactly ${bytes * 2} hex
 *     characters`, `Missing element #${id}`);
 *   - every `outputError` call passes either a literal or `(error as Error).message`;
 *   - and the five cipher dependencies interpolate lengths and numbers only —
 *     gm-crypto reports `Object.prototype.toString.call(x)`, which is a type tag like
 *     `[object Null]`, and @noble/ciphers reports `got length=` and numeric ranges.
 *
 * So CodeQL is over-approximating exception flow: it assumes a throw inside the try
 * may quote the arguments passed in. The sink is real, the taint is not. It is still
 * the wrong shape to leave in an error path whose whole job is to report malformed
 * input, which is exactly where someone will one day quote the input.
 *
 * The renderer takes its element factory as an argument so the node test can hand it
 * a stub and watch what it assigns.
 */

export interface ErrorHost {
  replaceChildren(...nodes: never[]): void;
}

export interface ErrorSpanFactory {
  createElement(tag: 'span'): { className: string; textContent: string | null };
}

export const ERROR_LABEL = 'Error';

export function renderError(
  host: ErrorHost,
  factory: ErrorSpanFactory,
  message: string,
): void {
  const label = factory.createElement('span');
  label.className = 'label';
  label.textContent = ERROR_LABEL;
  const detail = factory.createElement('span');
  detail.className = 'error-msg';
  detail.textContent = message;
  host.replaceChildren(...([label, detail] as unknown as never[]));
}
