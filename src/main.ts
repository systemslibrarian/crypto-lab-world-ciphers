import { cbc as aesCbc } from '@noble/ciphers/aes.js';
import { SM4 } from 'gm-crypto';
import { Kuznyechik } from '@li0ard/kuznyechik';
import { Aria, ARIA_IS1, ARIA_SB1, ariaDiffusion } from './ciphers/aria';
import { Camellia } from './ciphers/camellia';
import { CIPHERS } from './ciphers/registry';
import { KNOWN_ANSWER_TESTS } from './ciphers/test-vectors';
import {
  bytesToHex,
  bytesToUtf8,
  cbcDecrypt,
  cbcEncrypt,
  ecbDecrypt,
  ecbEncrypt,
  hexToBytes,
  randomBytes,
  randomHex,
  utf8ToBytes,
  xorBytes,
} from './ciphers/utils';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const themeToggle = $('theme-toggle') as HTMLButtonElement;

const setThemeButtonState = (): void => {
  const theme = document.documentElement.getAttribute('data-theme') ?? 'dark';
  const isDark = theme === 'dark';
  themeToggle.textContent = isDark ? '🌙' : '☀️';
  themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
};

setThemeButtonState();
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') ?? 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  setThemeButtonState();
});

const outputWithCopy = (el: HTMLElement, label: string, value: string, className = 'hex'): void => {
  el.innerHTML = '';
  const labelSpan = document.createElement('span');
  labelSpan.className = 'label';
  labelSpan.textContent = label;

  const valueSpan = document.createElement('span');
  valueSpan.className = className;
  valueSpan.textContent = value;

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'copy-btn';
  copy.textContent = 'Copy';
  copy.setAttribute('aria-label', `Copy ${label}`);
  copy.style.marginLeft = '0.6rem';
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(value);
    copy.textContent = 'Copied';
    setTimeout(() => {
      copy.textContent = 'Copy';
    }, 900);
  });

  el.append(labelSpan, valueSpan, copy);
};

const outputError = (el: HTMLElement, message: string): void => {
  el.innerHTML = `<span class="label">Error</span><span class="error-msg">${message}</span>`;
};

const fillRoundDots = (el: HTMLElement, rounds: number): void => {
  el.innerHTML = '';
  for (let i = 1; i <= rounds; i++) {
    const dot = document.createElement('span');
    dot.className = 'round-dot active';
    dot.title = `Round ${i}`;
    dot.setAttribute('aria-label', `Round ${i}`);
    el.appendChild(dot);
  }
};

const parseKeyHex = (raw: string, bytes: number, label: string): Uint8Array => {
  const clean = raw.trim().replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length !== bytes * 2) {
    throw new Error(`${label} must be exactly ${bytes * 2} hex characters`);
  }
  return hexToBytes(clean);
};

// Exhibit 1: Camellia
const camKeySize = $('cam-keysize') as HTMLSelectElement;
const camMode = $('cam-mode') as HTMLSelectElement;
const camKey = $('cam-key') as HTMLInputElement;
const camIv = $('cam-iv') as HTMLInputElement;
const camIvRow = $('cam-iv-row') as HTMLDivElement;
const camPlaintext = $('cam-plaintext') as HTMLInputElement;
const camOutput = $('cam-output');
const camRounds = $('cam-rounds');
const camCompareCam = $('cam-compare-camellia');
const camCompareCamDec = $('cam-compare-camellia-dec');
const camCompareAes = $('cam-compare-aes');
const camCompareAesDec = $('cam-compare-aes-dec');

let camLastCipherHex = '';

const refreshCamelliaDefaults = (): void => {
  const keyBytes = Number(camKeySize.value) / 8;
  if (!camKey.value.trim() || camKey.value.trim().length !== keyBytes * 2) {
    camKey.value = randomHex(keyBytes);
  }
  if (!camIv.value.trim() || camIv.value.trim().length !== 32) {
    camIv.value = randomHex(16);
  }
  camIvRow.style.display = camMode.value === 'cbc' ? 'flex' : 'none';
  fillRoundDots(camRounds, Number(camKeySize.value) === 128 ? 18 : 24);
};

camKeySize.addEventListener('change', refreshCamelliaDefaults);
camMode.addEventListener('change', refreshCamelliaDefaults);
refreshCamelliaDefaults();

$('cam-encrypt').addEventListener('click', () => {
  try {
    const key = parseKeyHex(camKey.value, Number(camKeySize.value) / 8, 'Camellia key');
    const plaintext = utf8ToBytes(camPlaintext.value);
    const cam = new Camellia(key);
    const cipher = camMode.value === 'cbc'
      ? cbcEncrypt(cam.encryptBlock.bind(cam), plaintext, parseKeyHex(camIv.value, 16, 'Camellia IV'))
      : ecbEncrypt(cam.encryptBlock.bind(cam), plaintext);

    camLastCipherHex = bytesToHex(cipher);
    outputWithCopy(camOutput, 'Ciphertext (hex)', camLastCipherHex);
  } catch (error) {
    outputError(camOutput, (error as Error).message);
  }
});

$('cam-decrypt').addEventListener('click', () => {
  try {
    if (!camLastCipherHex) throw new Error('Encrypt first to produce ciphertext');
    const key = parseKeyHex(camKey.value, Number(camKeySize.value) / 8, 'Camellia key');
    const cam = new Camellia(key);
    const decrypted = camMode.value === 'cbc'
      ? cbcDecrypt(cam.decryptBlock.bind(cam), hexToBytes(camLastCipherHex), parseKeyHex(camIv.value, 16, 'Camellia IV'))
      : ecbDecrypt(cam.decryptBlock.bind(cam), hexToBytes(camLastCipherHex));

    outputWithCopy(camOutput, 'Recovered plaintext', bytesToUtf8(decrypted), 'plaintext-result');
  } catch (error) {
    outputError(camOutput, (error as Error).message);
  }
});

$('cam-compare').addEventListener('click', () => {
  try {
    const key = parseKeyHex(camKey.value, 32, 'Comparison key (256-bit)');
    const iv = parseKeyHex(camIv.value, 16, 'Comparison IV');
    const plaintext = utf8ToBytes(camPlaintext.value);

    const cam = new Camellia(key);
    const camCipher = cbcEncrypt(cam.encryptBlock.bind(cam), plaintext, iv);
    const camDecrypted = cbcDecrypt(cam.decryptBlock.bind(cam), camCipher, iv);

    const aes = aesCbc(key, iv);
    const aesCipher = aes.encrypt(plaintext);
    const aesDecrypted = aes.decrypt(aesCipher);

    outputWithCopy(camCompareCam, 'Camellia ciphertext (hex)', bytesToHex(camCipher));
    outputWithCopy(camCompareCamDec, 'Camellia decrypted', bytesToUtf8(camDecrypted), 'plaintext-result');
    outputWithCopy(camCompareAes, 'AES ciphertext (hex)', bytesToHex(aesCipher));
    outputWithCopy(camCompareAesDec, 'AES decrypted', bytesToUtf8(aesDecrypted), 'plaintext-result');
  } catch (error) {
    outputError(camCompareCam, (error as Error).message);
    camCompareCamDec.innerHTML = '';
    camCompareAes.innerHTML = '';
    camCompareAesDec.innerHTML = '';
  }
});

// Exhibit 2: ARIA
const ariaKeySize = $('aria-keysize') as HTMLSelectElement;
const ariaKey = $('aria-key') as HTMLInputElement;
const ariaPlaintext = $('aria-plaintext') as HTMLInputElement;
const ariaOutput = $('aria-output');

let ariaLastCipherHex = '';

const refreshAriaDefaults = (): void => {
  const keyBytes = Number(ariaKeySize.value) / 8;
  if (!ariaKey.value.trim() || ariaKey.value.trim().length !== keyBytes * 2) {
    ariaKey.value = randomHex(keyBytes);
  }
};

ariaKeySize.addEventListener('change', refreshAriaDefaults);
refreshAriaDefaults();

$('aria-encrypt').addEventListener('click', () => {
  try {
    const key = parseKeyHex(ariaKey.value, Number(ariaKeySize.value) / 8, 'ARIA key');
    const aria = new Aria(key);
    const cipher = ecbEncrypt(aria.encryptBlock.bind(aria), utf8ToBytes(ariaPlaintext.value));
    ariaLastCipherHex = bytesToHex(cipher);
    outputWithCopy(ariaOutput, 'Ciphertext (hex)', ariaLastCipherHex);
  } catch (error) {
    outputError(ariaOutput, (error as Error).message);
  }
});

$('aria-decrypt').addEventListener('click', () => {
  try {
    if (!ariaLastCipherHex) throw new Error('Encrypt first to produce ciphertext');
    const key = parseKeyHex(ariaKey.value, Number(ariaKeySize.value) / 8, 'ARIA key');
    const aria = new Aria(key);
    const plain = ecbDecrypt(aria.decryptBlock.bind(aria), hexToBytes(ariaLastCipherHex));
    outputWithCopy(ariaOutput, 'Recovered plaintext', bytesToUtf8(plain), 'plaintext-result');
  } catch (error) {
    outputError(ariaOutput, (error as Error).message);
  }
});

const hex2 = (n: number): string => n.toString(16).padStart(2, '0').toUpperCase();

$('aria-sbox-go').addEventListener('click', () => {
  const inputEl = $('aria-sbox-input') as HTMLInputElement;
  const demo = $('aria-sbox-demo');
  const clean = inputEl.value.trim().replace(/^0x/i, '').padStart(2, '0').slice(-2);
  if (!/^[0-9a-fA-F]{2}$/.test(clean)) {
    outputError(demo, 'Enter exactly one byte in hex (00-ff)');
    return;
  }

  const x = parseInt(clean, 16);
  const s1 = ARIA_SB1[x];        // S1(x)
  const s1s1 = ARIA_SB1[s1];     // S1(S1(x)) — NOT x, proving non-involution
  const inv = ARIA_IS1[s1];      // S1⁻¹(S1(x)) = x

  demo.innerHTML = `
    <span class="step">Input: <strong>${hex2(x)}</strong></span>
    <span class="arrow">→</span>
    <span class="step">S₁(${hex2(x)}) = <strong>${hex2(s1)}</strong></span>
    <span class="arrow">→</span>
    <span class="step">S₁(S₁(x)) = <strong>${hex2(s1s1)}</strong>${s1s1 === x ? '' : ' ≠ ' + hex2(x)}</span>
    <span class="arrow">→</span>
    <span class="step">S₁⁻¹(S₁(x)) = <strong class="highlight">${hex2(inv)}</strong></span>
  `;
});

// ARIA involutory diffusion layer: A(A(x)) === x
const ariaDiffInput = $('aria-diff-input') as HTMLInputElement;
const ariaDiffOnce = $('aria-diff-once');
const ariaDiffTwice = $('aria-diff-twice');

$('aria-diff-go').addEventListener('click', () => {
  try {
    const state = parseKeyHex(ariaDiffInput.value, 16, 'State');
    const once = ariaDiffusion(state);
    const twice = ariaDiffusion(once);
    const recovered = bytesToHex(twice) === bytesToHex(state);
    outputWithCopy(ariaDiffOnce, 'A(state)', bytesToHex(once));
    outputWithCopy(
      ariaDiffTwice,
      recovered ? 'A(A(state)) = input ✓ involution holds' : 'A(A(state))',
      bytesToHex(twice),
      recovered ? 'plaintext-result' : 'hex',
    );
  } catch (error) {
    outputError(ariaDiffOnce, (error as Error).message);
    ariaDiffTwice.innerHTML = '';
  }
});

// Exhibit 3: SM4
const sm4Key = $('sm4-key') as HTMLInputElement;
const sm4Plaintext = $('sm4-plaintext') as HTMLInputElement;
const sm4Output = $('sm4-output');
const sm4Rounds = $('sm4-rounds');
let sm4LastCipherHex = '';

if (!sm4Key.value.trim() || sm4Key.value.trim().length !== 32) {
  sm4Key.value = randomHex(16);
}
fillRoundDots(sm4Rounds, 32);

$('sm4-encrypt').addEventListener('click', () => {
  try {
    const keyHex = parseKeyHex(sm4Key.value, 16, 'SM4 key');
    const cipherHex = SM4.encrypt(sm4Plaintext.value, bytesToHex(keyHex), {
      mode: SM4.constants.ECB,
      inputEncoding: 'utf8',
      outputEncoding: 'hex',
    });
    sm4LastCipherHex = cipherHex;
    outputWithCopy(sm4Output, 'Ciphertext (hex)', cipherHex);
  } catch (error) {
    outputError(sm4Output, (error as Error).message);
  }
});

$('sm4-decrypt').addEventListener('click', () => {
  try {
    if (!sm4LastCipherHex) throw new Error('Encrypt first to produce ciphertext');
    const keyHex = parseKeyHex(sm4Key.value, 16, 'SM4 key');
    const plain = SM4.decrypt(sm4LastCipherHex, bytesToHex(keyHex), {
      mode: SM4.constants.ECB,
      inputEncoding: 'hex',
      outputEncoding: 'utf8',
    });
    outputWithCopy(sm4Output, 'Recovered plaintext', plain, 'plaintext-result');
  } catch (error) {
    outputError(sm4Output, (error as Error).message);
  }
});

// Exhibit 4: Kuznyechik
const kuzKey = $('kuz-key') as HTMLInputElement;
const kuzPlaintext = $('kuz-plaintext') as HTMLInputElement;
const kuzOutput = $('kuz-output');
let kuzLastCipherHex = '';

if (!kuzKey.value.trim() || kuzKey.value.trim().length !== 64) {
  kuzKey.value = randomHex(32);
}

$('kuz-encrypt').addEventListener('click', () => {
  try {
    const key = parseKeyHex(kuzKey.value, 32, 'Kuznyechik key');
    const kuzn = new Kuznyechik(key);
    const cipher = ecbEncrypt(kuzn.encryptBlock.bind(kuzn), utf8ToBytes(kuzPlaintext.value));
    kuzLastCipherHex = bytesToHex(cipher);
    outputWithCopy(kuzOutput, 'Ciphertext (hex)', kuzLastCipherHex);
  } catch (error) {
    outputError(kuzOutput, (error as Error).message);
  }
});

$('kuz-decrypt').addEventListener('click', () => {
  try {
    if (!kuzLastCipherHex) throw new Error('Encrypt first to produce ciphertext');
    const key = parseKeyHex(kuzKey.value, 32, 'Kuznyechik key');
    const kuzn = new Kuznyechik(key);
    const plain = ecbDecrypt(kuzn.decryptBlock.bind(kuzn), hexToBytes(kuzLastCipherHex));
    outputWithCopy(kuzOutput, 'Recovered plaintext', bytesToUtf8(plain), 'plaintext-result');
  } catch (error) {
    outputError(kuzOutput, (error as Error).message);
  }
});

// ============================================================
// Verified Correctness — live known-answer tests
// ============================================================
const katTbody = $('kat-tbody') as HTMLTableSectionElement;
const katSummary = $('kat-summary');

const runKnownAnswerTests = (): void => {
  katTbody.innerHTML = '';
  let passed = 0;
  for (const t of KNOWN_ANSWER_TESTS) {
    let ok = false;
    let actual = '';
    try {
      actual = bytesToHex(CIPHERS[t.cipher].blockEncrypt(hexToBytes(t.key), hexToBytes(t.plaintext)));
      ok = actual === t.ciphertext;
    } catch (error) {
      actual = (error as Error).message;
    }
    if (ok) passed++;

    const row = document.createElement('tr');
    const result = document.createElement('td');
    result.className = ok ? 'kat-pass' : 'kat-fail';
    result.textContent = ok ? '✓ PASS' : '✗ FAIL';
    const vector = document.createElement('td');
    vector.textContent = t.label;
    const source = document.createElement('td');
    source.textContent = t.source;
    const expected = document.createElement('td');
    expected.className = 'kat-hex';
    expected.textContent = ok ? t.ciphertext : `${t.ciphertext} (got ${actual})`;
    row.append(result, vector, source, expected);
    katTbody.appendChild(row);
  }

  const allPass = passed === KNOWN_ANSWER_TESTS.length;
  katSummary.textContent = `${passed}/${KNOWN_ANSWER_TESTS.length} vectors reproduced exactly`;
  katSummary.className = `kat-summary ${allPass ? 'kat-pass' : 'kat-fail'}`;
};

$('kat-run').addEventListener('click', runKnownAnswerTests);
runKnownAnswerTests();

// ============================================================
// Exhibit 5 — Avalanche effect
// ============================================================
const avCipher = $('av-cipher') as HTMLSelectElement;
const avFlip = $('av-flip') as HTMLSelectElement;
const avBase = $('av-base');
const avFlipped = $('av-flipped');
const avSummary = $('av-summary');
const avGrid = $('av-grid');

let avKey = randomBytes(32);
let avBlock = randomBytes(16);

// Populate the "which bit to flip" selector (128 bits).
for (let bit = 0; bit < 128; bit++) {
  const opt = document.createElement('option');
  opt.value = String(bit);
  opt.textContent = `bit ${bit} (byte ${bit >> 3}, bit ${7 - (bit % 8)})`;
  avFlip.appendChild(opt);
}

const popcount = (b: number): number => {
  let c = 0;
  while (b) { c += b & 1; b >>= 1; }
  return c;
};

const runAvalanche = (): void => {
  try {
    const spec = CIPHERS[avCipher.value];
    const key = avKey.slice(0, spec.keyBytes);
    const base = spec.blockEncrypt(key, avBlock);

    const flipped = avBlock.slice();
    const bit = Number(avFlip.value);
    flipped[bit >> 3] ^= 1 << (7 - (bit % 8));
    const flippedCt = spec.blockEncrypt(key, flipped);

    const diff = xorBytes(base, flippedCt);
    let changed = 0;
    for (const byte of diff) changed += popcount(byte);

    outputWithCopy(avBase, 'Ciphertext of original block', bytesToHex(base));
    outputWithCopy(avFlipped, 'Ciphertext after flipping one plaintext bit', bytesToHex(flippedCt));

    const pct = ((changed / 128) * 100).toFixed(1);
    avSummary.innerHTML = `<strong>${changed} of 128</strong> ciphertext bits changed (${pct}%) from a single flipped input bit.`;

    avGrid.innerHTML = '';
    for (let i = 0; i < 128; i++) {
      const cell = document.createElement('span');
      const on = (diff[i >> 3] >> (7 - (i % 8))) & 1;
      cell.className = on ? 'bit-cell on' : 'bit-cell';
      avGrid.appendChild(cell);
    }
  } catch (error) {
    outputError(avBase, (error as Error).message);
    avFlipped.innerHTML = '';
    avSummary.textContent = '';
    avGrid.innerHTML = '';
  }
};

$('av-run').addEventListener('click', runAvalanche);
avCipher.addEventListener('change', runAvalanche);
avFlip.addEventListener('change', runAvalanche);
$('av-random').addEventListener('click', () => {
  avKey = randomBytes(32);
  avBlock = randomBytes(16);
  runAvalanche();
});
runAvalanche();

// ============================================================
// Exhibit 6 — ECB vs CBC pattern leakage
// ============================================================
const modeCipher = $('mode-cipher') as HTMLSelectElement;
const modeEcb = $('mode-ecb');
const modeCbc = $('mode-cbc');
const modeEcbNote = $('mode-ecb-note');
const modeCbcNote = $('mode-cbc-note');

const renderBlocks = (container: HTMLElement, blocks: string[]): void => {
  container.innerHTML = '';
  // Mark blocks that repeat so ECB's leakage is visually obvious.
  const counts = new Map<string, number>();
  for (const b of blocks) counts.set(b, (counts.get(b) ?? 0) + 1);
  blocks.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = counts.get(b)! > 1 ? 'cipher-block repeat' : 'cipher-block';
    const label = document.createElement('span');
    label.className = 'block-label';
    label.textContent = `block ${i + 1}`;
    const val = document.createElement('span');
    val.className = 'block-hex';
    val.textContent = b;
    row.append(label, val);
    container.appendChild(row);
  });
};

const splitBlocks = (bytes: Uint8Array): string[] => {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) out.push(bytesToHex(bytes.slice(i, i + 16)));
  return out;
};

const runMode = (): void => {
  try {
    const spec = CIPHERS[modeCipher.value];
    const key = randomBytes(spec.keyBytes);
    const iv = randomBytes(16);

    // Three identical 16-byte plaintext blocks.
    const oneBlock = utf8ToBytes('REPEAT-ME-1234!!').slice(0, 16);
    const plaintext = new Uint8Array(48);
    plaintext.set(oneBlock, 0);
    plaintext.set(oneBlock, 16);
    plaintext.set(oneBlock, 32);

    // ECB: each block encrypted independently.
    const ecb = new Uint8Array(48);
    for (let i = 0; i < 48; i += 16) ecb.set(spec.blockEncrypt(key, plaintext.slice(i, i + 16)), i);

    // CBC: chain each block into the next with the IV.
    const cbc = new Uint8Array(48);
    let prev = iv;
    for (let i = 0; i < 48; i += 16) {
      const enc = spec.blockEncrypt(key, xorBytes(plaintext.slice(i, i + 16), prev));
      cbc.set(enc, i);
      prev = enc;
    }

    const ecbBlocks = splitBlocks(ecb);
    const cbcBlocks = splitBlocks(cbc);
    renderBlocks(modeEcb, ecbBlocks);
    renderBlocks(modeCbc, cbcBlocks);

    const allEcbEqual = ecbBlocks.every((b) => b === ecbBlocks[0]);
    const allCbcDistinct = new Set(cbcBlocks).size === cbcBlocks.length;
    modeEcbNote.innerHTML = allEcbEqual
      ? '⚠️ All three blocks are <strong>identical</strong> — the repetition leaked straight through.'
      : 'Blocks differ.';
    modeCbcNote.innerHTML = allCbcDistinct
      ? '✓ All three blocks <strong>differ</strong>, even though the plaintext repeated.'
      : 'Blocks repeat (unexpected).';
  } catch (error) {
    outputError(modeEcb, (error as Error).message);
    modeCbc.innerHTML = '';
  }
};

$('mode-run').addEventListener('click', runMode);
modeCipher.addEventListener('change', runMode);
runMode();

