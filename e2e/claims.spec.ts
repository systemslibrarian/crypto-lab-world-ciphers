import { expect, test, type Page } from '@playwright/test';

/**
 * Functional claims gate for World Ciphers.
 *
 * The a11y spec proves the page is reachable and clicks every button; it never
 * looks at what the ciphers produced. This spec asserts the load-bearing
 * claims: the live known-answer panel really reproduces the official vectors,
 * every cipher the page offers round-trips encrypt -> decrypt back to the
 * original text in every key size and mode it offers, every error path the
 * page can reach reports the right reason, and the measured statistics
 * (avalanche bit counts, ECB block repetition, the penguin's block structure)
 * are re-derived here from the bytes the page actually rendered.
 */

/**
 * Official vectors from each cipher's defining standard. These are external
 * ground truth, NOT copied from the app: RFC 3713 Appendix A (Camellia),
 * RFC 5794 (ARIA), GB/T 32907-2016 Appendix A.1 (SM4) and GOST R 34.12-2015 /
 * RFC 7801 (Kuznyechik).
 */
const OFFICIAL_VECTORS: Record<string, { source: string; ciphertext: string }> = {
  'Camellia-128': { source: 'RFC 3713 §A', ciphertext: '67673138549669730857065648eabe43' },
  'Camellia-192': { source: 'RFC 3713 §A', ciphertext: 'b4993401b3e996f84ee5cee7d79b09b9' },
  'Camellia-256': { source: 'RFC 3713 §A', ciphertext: '9acc237dff16d76c20ef7c919e3a7509' },
  'ARIA-128': { source: 'RFC 5794', ciphertext: 'd718fbd6ab644c739da95f3be6451778' },
  'ARIA-256': { source: 'RFC 5794', ciphertext: 'f92bd7c79fb72e2f2b8f80c1972d24fc' },
  'SM4-128': { source: 'GB/T 32907-2016 §A.1', ciphertext: '681edf34d206965e86b3e94f536e4246' },
  'Kuznyechik-256': {
    source: 'GOST R 34.12-2015 / RFC 7801',
    ciphertext: '7f679d90bebc24305a468d42b9d4edcd',
  },
};

interface Panel {
  /** Element id prefix: #<id>-encrypt, #<id>-key, ... */
  id: string;
  name: string;
  /** Key-size selector values, when the panel offers one. */
  keySizes?: string[];
  /** Mode selector values, when the panel offers one. */
  modes?: string[];
  /** Fixed key length in hex characters for panels with no key-size selector. */
  keyHexChars?: number;
  /** A wrong-but-well-formed key, for the wrong-key decryption path. */
  wrongKey: string;
}

const PANELS: Panel[] = [
  { id: 'cam', name: 'Camellia', keySizes: ['128', '192', '256'], modes: ['ecb', 'cbc'], wrongKey: 'a1'.repeat(32) },
  { id: 'aria', name: 'ARIA', keySizes: ['128', '192', '256'], wrongKey: 'b2'.repeat(32) },
  { id: 'sm4', name: 'SM4', keyHexChars: 32, wrongKey: 'c3'.repeat(16) },
  { id: 'kuz', name: 'Kuznyechik', keyHexChars: 64, wrongKey: 'd4'.repeat(32) },
];

const CIPHER_OPTIONS = ['Camellia', 'ARIA', 'SM4', 'Kuznyechik'] as const;

const text = async (page: Page, selector: string): Promise<string> =>
  ((await page.locator(selector).textContent()) ?? '').trim();

const outHex = (page: Page, id: string): Promise<string> => text(page, `#${id}-output .hex`);
const outPlain = (page: Page, id: string): Promise<string> =>
  text(page, `#${id}-output .plaintext-result`);
const outError = (page: Page, id: string): Promise<string> =>
  text(page, `#${id}-output .error-msg`);

/** Pull the first captured integer out of a DOM string. */
function numOf(s: string, re: RegExp): number {
  const m = s.match(re);
  expect(m, `expected ${re} to match in: ${s}`).not.toBeNull();
  return Number(m![1]);
}

function hexToBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

/** Hamming distance between two equal-length hex strings, in bits. */
function bitsDifferent(aHex: string, bHex: string): number {
  const a = hexToBytes(aHex);
  const b = hexToBytes(bHex);
  expect(a.length).toBe(b.length);
  let bits = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i];
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

/** Expected PKCS#7-padded ciphertext length, in hex characters. */
function paddedHexLength(plaintext: string): number {
  const n = new TextEncoder().encode(plaintext).length;
  return (Math.floor(n / 16) + 1) * 32;
}

/** Read a 96x96 canvas back as the grayscale byte plane the page painted into it. */
async function canvasBytes(page: Page, id: string): Promise<number[]> {
  return page.evaluate((canvasId) => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const out: number[] = [];
    for (let i = 0; i < data.length; i += 4) out.push(data[i]);
    return out;
  }, id);
}

function distinctBlocks(bytes: number[]): number {
  const seen = new Set<string>();
  for (let i = 0; i < bytes.length; i += 16) seen.add(bytes.slice(i, i + 16).join(','));
  return seen.size;
}

test.beforeEach(async ({ page }) => {
  await page.goto('.');
  // Everything below depends on the live KAT panel having run on load.
  await expect(page.locator('#kat-tbody tr').first()).toBeVisible();
});

test('the live known-answer panel reproduces every official vector', async ({ page }) => {
  const rows = await page.locator('#kat-tbody tr').evaluateAll((trs) =>
    trs.map((tr) => Array.from(tr.children).map((td) => (td.textContent ?? '').trim())),
  );
  expect(rows.length).toBe(Object.keys(OFFICIAL_VECTORS).length);

  for (const [result, label, source, expectedHex] of rows) {
    const official = OFFICIAL_VECTORS[label];
    expect(official, `unexpected KAT row "${label}"`).toBeTruthy();
    expect(result).toBe('✓ PASS');
    expect(source).toBe(official.source);
    // A failing row appends "(got ...)", so an exact match also proves it passed.
    expect(expectedHex).toBe(official.ciphertext);
  }

  // The headline counter must be the row tally, not a constant.
  const summary = await text(page, '#kat-summary');
  const passRows = await page.locator('#kat-tbody .kat-pass').count();
  expect(numOf(summary, /^(\d+)\//)).toBe(passRows);
  expect(numOf(summary, /^\d+\/(\d+)/)).toBe(rows.length);
  expect(passRows).toBe(rows.length);
  await expect(page.locator('#kat-summary')).toHaveClass(/kat-pass/);
  await expect(page.locator('#kat-tbody .kat-fail')).toHaveCount(0);

  // All four national ciphers are represented.
  const labels = rows.map((r) => r[1]);
  for (const name of ['Camellia', 'ARIA', 'SM4', 'Kuznyechik']) {
    expect(labels.some((l) => l.startsWith(name)), `no KAT vector for ${name}`).toBe(true);
  }

  // Re-running recomputes the same result rather than leaving a stale table.
  await page.locator('#kat-run').click();
  await expect(page.locator('#kat-tbody tr')).toHaveCount(rows.length);
  await expect(page.locator('#kat-tbody .kat-pass')).toHaveCount(rows.length);
  expect(await text(page, '#kat-summary')).toBe(summary);
});

test('every cipher, key size and mode round-trips encrypt then decrypt', async ({ page }) => {
  const ciphertexts = new Map<string, string>();

  for (const panel of PANELS) {
    const plaintext = await page.locator(`#${panel.id}-plaintext`).inputValue();
    expect(plaintext.length).toBeGreaterThan(0);

    for (const keySize of panel.keySizes ?? [null]) {
      for (const mode of panel.modes ?? [null]) {
        const label = `${panel.name}${keySize ? `-${keySize}` : ''}${mode ? `/${mode}` : ''}`;
        if (keySize) await page.locator(`#${panel.id}-keysize`).selectOption(keySize);
        if (mode) await page.locator(`#${panel.id}-mode`).selectOption(mode);

        // The key field must have been (re)seeded to the selected key length.
        const keyHex = (await page.locator(`#${panel.id}-key`).inputValue()).trim();
        const expectedKeyChars = keySize ? Number(keySize) / 4 : panel.keyHexChars!;
        expect(keyHex, `${label}: key field length`).toHaveLength(expectedKeyChars);
        expect(keyHex).toMatch(/^[0-9a-f]+$/i);

        await page.locator(`#${panel.id}-encrypt`).click();
        await expect(page.locator(`#${panel.id}-output .label`)).toHaveText('Ciphertext (hex)');
        const cipherHex = await outHex(page, panel.id);
        expect(cipherHex, `${label}: ciphertext is hex`).toMatch(/^[0-9a-f]+$/);
        // PKCS#7 always adds a block when the plaintext is a whole number of
        // blocks, so the length is a pure function of the plaintext length.
        expect(cipherHex.length, `${label}: PKCS#7 padded length`).toBe(paddedHexLength(plaintext));
        expect(cipherHex).not.toContain(
          Array.from(new TextEncoder().encode(plaintext))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(''),
        );
        ciphertexts.set(label, cipherHex);

        await page.locator(`#${panel.id}-decrypt`).click();
        await expect(page.locator(`#${panel.id}-output .label`)).toHaveText('Recovered plaintext');
        expect(await outPlain(page, panel.id), `${label}: round trip`).toBe(plaintext);
      }
    }
  }

  // 11 configurations, no two of which produced the same ciphertext.
  expect(ciphertexts.size).toBe(11);
  expect(new Set(ciphertexts.values()).size).toBe(ciphertexts.size);
});

test('ECB is deterministic and any plaintext change changes the ciphertext', async ({ page }) => {
  await page.locator('#cam-mode').selectOption('ecb');
  await page.locator('#cam-encrypt').click();
  const first = await outHex(page, 'cam');
  await page.locator('#cam-encrypt').click();
  const second = await outHex(page, 'cam');
  expect(second).toBe(first); // same key, same plaintext, no IV: identical output

  const original = await page.locator('#cam-plaintext').inputValue();
  await page.locator('#cam-plaintext').fill(`${original.slice(0, -1)}?`);
  await page.locator('#cam-encrypt').click();
  const changed = await outHex(page, 'cam');
  expect(changed).not.toBe(first);
  expect(changed).toHaveLength(first.length);
  // One changed character, and far more than one changed ciphertext bit.
  expect(bitsDifferent(first, changed)).toBeGreaterThan(16);

  // CBC with the same key and IV is equally deterministic, but different from ECB.
  await page.locator('#cam-plaintext').fill(original);
  await page.locator('#cam-mode').selectOption('cbc');
  await page.locator('#cam-encrypt').click();
  const cbcHex = await outHex(page, 'cam');
  expect(cbcHex).not.toBe(first);
  await page.locator('#cam-decrypt').click();
  expect(await outPlain(page, 'cam')).toBe(original);
});

test('the Camellia/AES comparison shows different ciphertext but identical plaintext', async ({
  page,
}) => {
  await page.locator('#cam-keysize').selectOption('256');
  await page.locator('#cam-mode').selectOption('cbc');
  const plaintext = await page.locator('#cam-plaintext').inputValue();

  await page.locator('#cam-compare').click();
  const camHex = await text(page, '#cam-compare-camellia .hex');
  const aesHex = await text(page, '#cam-compare-aes .hex');
  const camPlain = await text(page, '#cam-compare-camellia-dec .plaintext-result');
  const aesPlain = await text(page, '#cam-compare-aes-dec .plaintext-result');

  // The stated takeaway: same key, same IV, same plaintext, different algorithms.
  expect(camHex).toMatch(/^[0-9a-f]+$/);
  expect(aesHex).toMatch(/^[0-9a-f]+$/);
  expect(camHex).not.toBe(aesHex);
  expect(camHex).toHaveLength(paddedHexLength(plaintext));
  // ...and both still recover exactly the same plaintext.
  expect(camPlain).toBe(plaintext);
  expect(aesPlain).toBe(plaintext);
});

test('the round counters show each cipher\'s real round count', async ({ page }) => {
  // Camellia: 18 rounds for a 128-bit key, 24 for 192/256 (RFC 3713).
  for (const [keySize, rounds] of [
    ['128', 18],
    ['192', 24],
    ['256', 24],
  ] as const) {
    await page.locator('#cam-keysize').selectOption(keySize);
    await expect(page.locator('#cam-rounds .round-dot')).toHaveCount(rounds);
    await expect(page.locator('#cam-rounds')).toHaveAttribute('aria-label', `${rounds} rounds`);
  }
  // SM4: 32 rounds (GB/T 32907-2016).
  await expect(page.locator('#sm4-rounds .round-dot')).toHaveCount(32);
  await expect(page.locator('#sm4-rounds')).toHaveAttribute('aria-label', '32 rounds');
});

test('decrypting before encrypting fails with the reason, for every cipher', async ({ page }) => {
  for (const panel of PANELS) {
    await page.locator(`#${panel.id}-decrypt`).click();
    expect(await outError(page, panel.id), `${panel.name}`).toBe(
      'Encrypt first to produce ciphertext',
    );
  }
});

test('a malformed key is rejected with the exact length it needed', async ({ page }) => {
  for (const panel of PANELS) {
    for (const keySize of panel.keySizes ?? [null]) {
      if (keySize) await page.locator(`#${panel.id}-keysize`).selectOption(keySize);
      const needed = keySize ? Number(keySize) / 4 : panel.keyHexChars!;
      await page.locator(`#${panel.id}-key`).fill('zz');
      await page.locator(`#${panel.id}-encrypt`).click();
      // The message must quote the length the SELECTED key size actually needs.
      expect(await outError(page, panel.id)).toBe(
        `${panel.name} key must be exactly ${needed} hex characters`,
      );

      // Right characters, wrong length: still rejected.
      await page.locator(`#${panel.id}-key`).fill('ab'.repeat(needed / 2 - 1));
      await page.locator(`#${panel.id}-encrypt`).click();
      expect(await outError(page, panel.id)).toContain(`exactly ${needed} hex characters`);
    }
  }
});

test('decrypting under the wrong key never returns the plaintext', async ({ page }) => {
  for (const panel of PANELS) {
    const plaintext = await page.locator(`#${panel.id}-plaintext`).inputValue();
    await page.locator(`#${panel.id}-encrypt`).click();
    const cipherHex = await outHex(page, panel.id);
    expect(cipherHex.length).toBeGreaterThan(0);

    await page.locator(`#${panel.id}-key`).fill(panel.wrongKey);
    await page.locator(`#${panel.id}-decrypt`).click();
    // Either the padding check rejects it or it yields garbage — but never the
    // original text. That is the whole point of a key.
    const shown = await text(page, `#${panel.id}-output`);
    expect(shown, `${panel.name} under the wrong key`).not.toContain(plaintext);
  }
});

test('the ARIA S-box exhibit proves S1 is not an involution and IS1 inverts it', async ({
  page,
}) => {
  await page.locator('#aria-sbox-input').fill('3f');
  await page.locator('#aria-sbox-go').click();

  const demo = (await text(page, '#aria-sbox-demo')).replace(/\s+/g, ' ');
  const input = demo.match(/Input: ([0-9A-F]{2})/)![1];
  const s1 = demo.match(/S₁\([0-9A-F]{2}\) = ([0-9A-F]{2})/)![1];
  const s1s1 = demo.match(/S₁\(S₁\(x\)\) = ([0-9A-F]{2})/)![1];
  const inv = demo.match(/S₁⁻¹\(S₁\(x\)\) = ([0-9A-F]{2})/)![1];

  expect(input).toBe('3F');
  // Not an involution: applying S1 twice does NOT come back.
  expect(s1s1).not.toBe(input);
  expect(demo).toContain(`${s1s1} ≠ ${input}`);
  // The real inverse does come back.
  expect(inv).toBe(input);
  expect(s1).not.toBe(input);

  // The grid the animation walks is the same table: cell (row, col) of the
  // input byte holds S1(input).
  const cell = await text(page, `#aria-sbox-grid td[data-idx="${parseInt(input, 16)}"]`);
  expect(cell).toBe(s1);

  // The animation highlights that cell, and its row and column headers.
  await expect(page.locator('#aria-sbox-grid .sg-hot')).toHaveAttribute(
    'data-idx',
    String(parseInt(input, 16)),
  );
  await expect(page.locator('#aria-sbox-grid .sg-row-hot')).toHaveAttribute('data-row', '3');
  await expect(page.locator('#aria-sbox-grid .sg-col-hot')).toHaveAttribute('data-col', '15');
  await expect(page.locator('#aria-sbox-step')).toContainText(`row 3, col F → ${s1}`);

  // Step two of the animation lands somewhere else, which is the exhibit's point.
  await expect(page.locator('#aria-sbox-step')).toContainText('NOT an involution', {
    timeout: 5_000,
  });
  await expect(page.locator('#aria-sbox-step')).toContainText(`= ${inv} — back to your byte`, {
    timeout: 5_000,
  });

  // A malformed byte is refused rather than silently coerced.
  await page.locator('#aria-sbox-input').fill('zz');
  await page.locator('#aria-sbox-go').click();
  expect(await text(page, '#aria-sbox-demo .error-msg')).toBe('Enter exactly one byte in hex (00-ff)');
});

test('the ARIA diffusion layer really is an involution', async ({ page }) => {
  for (const state of ['00112233445566778899aabbccddeeff', 'ffeeddccbbaa99887766554433221100']) {
    await page.locator('#aria-diff-input').fill(state);
    await page.locator('#aria-diff-go').click();

    const once = await text(page, '#aria-diff-once .hex');
    const twice = await text(page, '#aria-diff-twice .plaintext-result');
    expect(once).toHaveLength(32);
    expect(once).not.toBe(state); // A really mixes
    expect(twice).toBe(state); // ...and A(A(x)) comes back
    await expect(page.locator('#aria-diff-twice .label')).toContainText('involution holds');
    // A is a byte permutation, so the multiset of bytes is preserved.
    expect(hexToBytes(once).sort().join()).toBe(hexToBytes(state).sort().join());
  }

  await page.locator('#aria-diff-input').fill('nothex');
  await page.locator('#aria-diff-go').click();
  expect(await text(page, '#aria-diff-once .error-msg')).toBe('State must be exactly 32 hex characters');
});

test('the SM4 animation runs all 32 real rounds', async ({ page }) => {
  await page.locator('#sm4-encrypt').click();
  await expect(page.locator('#sm4-output .label')).toHaveText('Ciphertext (hex)');

  // The animation walks to the last round and the progress bar tracks it.
  await expect(page.locator('#sm4-anim-round')).toHaveText(/Round 32 of 32/, { timeout: 20_000 });
  await expect(page.locator('#sm4-anim-bar')).toHaveAttribute('style', /width:\s*100%/);

  const label = await text(page, '#sm4-anim-round');
  // Round r replaces word X(r+3): round 32 produces X35.
  expect(numOf(label, /new word X(\d+)/)).toBe(numOf(label, /Round (\d+) of/) + 3);
  // The round total in the animation agrees with the round-dot counter.
  expect(numOf(label, /Round \d+ of (\d+)/)).toBe(
    await page.locator('#sm4-rounds .round-dot').count(),
  );

  // Four live 32-bit state words plus the round key, all real hex.
  const words = await page.locator('#sm4-anim-state .ra-word').allTextContents();
  expect(words.length).toBe(5);
  for (const word of words) expect(word.replace(/\s+/g, '')).toMatch(/^(X\d|rk)[0-9a-f]{8}$/);

  await page.locator('#sm4-anim-run').click();
  await expect(page.locator('#sm4-anim-round')).toHaveText(/Round 32 of 32/, { timeout: 20_000 });
});

test('the avalanche statistic matches the ciphertexts it is measured from', async ({ page }) => {
  for (const cipher of CIPHER_OPTIONS) {
    await page.locator('#av-cipher').selectOption(cipher);
    await page.locator('#av-run').click();

    const base = await text(page, '#av-base .hex');
    const flipped = await text(page, '#av-flipped .hex');
    expect(base, `${cipher} base block`).toHaveLength(32);
    expect(flipped).toHaveLength(32);
    expect(flipped).not.toBe(base);

    const summary = await text(page, '#av-summary');
    const claimed = numOf(summary, /(\d+) of 128/);
    // Re-derive the statistic from the two ciphertexts the page printed.
    expect(claimed, `${cipher}: claimed bits vs XOR of the printed ciphertexts`).toBe(
      bitsDifferent(base, flipped),
    );
    // ...and from the bit grid it drew.
    expect(await page.locator('#av-grid .bit-cell').count()).toBe(128);
    expect(await page.locator('#av-grid .bit-cell.on').count()).toBe(claimed);
    expect(summary).toContain(`${((claimed / 128) * 100).toFixed(1)}%`);

    // The claim the exhibit makes: about half the bits, for every cipher.
    // Sample many single-bit flips and check the average, so one unlucky draw
    // cannot fail the run and a broken avalanche cannot pass it.
    let total = 0;
    let minimum = 128;
    const samples = 16;
    for (let i = 0; i < samples; i++) {
      await page.locator('#av-flip').selectOption(String(i * 8));
      const changed = numOf(await text(page, '#av-summary'), /(\d+) of 128/);
      expect(changed).toBe(
        bitsDifferent(await text(page, '#av-base .hex'), await text(page, '#av-flipped .hex')),
      );
      total += changed;
      minimum = Math.min(minimum, changed);
    }
    const mean = total / samples;
    expect(mean, `${cipher}: mean avalanche over ${samples} flips`).toBeGreaterThan(52);
    expect(mean, `${cipher}: mean avalanche over ${samples} flips`).toBeLessThan(76);
    expect(minimum, `${cipher}: weakest single flip`).toBeGreaterThan(24);
  }
});

test('ECB repeats identical blocks and CBC does not, for every cipher', async ({ page }) => {
  for (const cipher of CIPHER_OPTIONS) {
    await page.locator('#mode-cipher').selectOption(cipher);
    await page.locator('#mode-run').click();

    const ecb = await page.locator('#mode-ecb .cipher-block .block-hex').allTextContents();
    const cbc = await page.locator('#mode-cbc .cipher-block .block-hex').allTextContents();
    expect(ecb.length, `${cipher}: ECB block count`).toBe(3);
    expect(cbc.length).toBe(3);
    for (const block of [...ecb, ...cbc]) expect(block).toMatch(/^[0-9a-f]{32}$/);

    // Three identical plaintext blocks: ECB leaks that, CBC hides it.
    expect(new Set(ecb).size, `${cipher}: ECB blocks should all be identical`).toBe(1);
    expect(new Set(cbc).size, `${cipher}: CBC blocks should all differ`).toBe(3);
    await expect(page.locator('#mode-ecb .cipher-block.repeat')).toHaveCount(3);
    await expect(page.locator('#mode-cbc .cipher-block.repeat')).toHaveCount(0);
    await expect(page.locator('#mode-ecb-note')).toContainText('identical');
    await expect(page.locator('#mode-cbc-note')).toContainText('differ');
    // Same plaintext, same cipher — the modes must not agree.
    expect(ecb[0]).not.toBe(cbc[0]);
  }
});

test('the ECB penguin survives in the ciphertext blocks, and CBC erases it', async ({ page }) => {
  for (const cipher of CIPHER_OPTIONS) {
    await page.locator('#penguin-cipher').selectOption(cipher);
    await page.locator('#penguin-run').click();
    await expect(page.locator('#penguin-note')).toContainText('Encrypted 9216 real image bytes');

    const note = await text(page, '#penguin-note');
    const bytes = numOf(note, /Encrypted (\d+) real image bytes/);
    const blocks = numOf(note, /\((\d+) blocks\)/);
    expect(blocks, 'stated block count vs stated byte count').toBe(bytes / 16);
    // The note must name the cipher that was actually selected (the option
    // label is "<flag> <display name>").
    const optionLabel = await text(page, '#penguin-cipher option:checked');
    const displayName = optionLabel.split(' ').slice(1).join(' ');
    expect(displayName.length).toBeGreaterThan(0);
    expect(note).toContain(displayName);

    const plain = await canvasBytes(page, 'penguin-plain');
    const ecb = await canvasBytes(page, 'penguin-ecb');
    const cbc = await canvasBytes(page, 'penguin-cbc');
    expect(plain.length).toBe(bytes);
    expect(ecb.length).toBe(bytes);
    expect(cbc.length).toBe(bytes);

    const plainDistinct = distinctBlocks(plain);
    // The image really does repeat blocks — otherwise there would be nothing to leak.
    expect(plainDistinct, `${cipher}: flat regions in the source image`).toBeLessThan(blocks);

    // ECB is a bijection on blocks, so it preserves the repetition structure
    // EXACTLY: the ghost is the equal block count. CBC chains, so every block
    // comes out distinct.
    expect(distinctBlocks(ecb), `${cipher}: ECB preserves the block structure`).toBe(plainDistinct);
    expect(distinctBlocks(cbc), `${cipher}: CBC destroys the block structure`).toBe(blocks);
    expect(ecb.join()).not.toBe(cbc.join());
    expect(ecb.join()).not.toBe(plain.join());
  }
});

test('every in-page link points at something that exists', async ({ page }) => {
  const anchors = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')).map((a) => ({
      href: a.getAttribute('href') ?? '',
      label: (a.textContent ?? '').trim().slice(0, 40),
      resolves: !!document.getElementById((a.getAttribute('href') ?? '').slice(1)),
    })),
  );
  expect(anchors.length).toBeGreaterThan(10);
  // Regression: the shared header's skip link pointed at #app, an id this lab
  // does not have, so "Skip to content" went nowhere.
  expect(anchors.filter((a) => !a.resolves)).toEqual([]);

  const skipTargets = anchors.filter((a) => /skip to content/i.test(a.label)).map((a) => a.href);
  expect(skipTargets.length).toBeGreaterThan(0);
  for (const target of skipTargets) {
    await expect(page.locator(target)).toHaveCount(1);
  }
});
