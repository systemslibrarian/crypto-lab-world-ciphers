import { cbc as aesCbc } from '@noble/ciphers/aes.js';
import { SM4 } from 'gm-crypto';
import { Kuznyechik } from '@li0ard/kuznyechik';
import { Aria, ARIA_IS1, ARIA_SB1 } from './ciphers/aria';
import { Camellia } from './ciphers/camellia';
import {
  bytesToHex,
  bytesToUtf8,
  cbcDecrypt,
  cbcEncrypt,
  ecbDecrypt,
  ecbEncrypt,
  hexToBytes,
  randomHex,
  utf8ToBytes,
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

$('aria-sbox-go').addEventListener('click', () => {
  const inputEl = $('aria-sbox-input') as HTMLInputElement;
  const demo = $('aria-sbox-demo');
  const clean = inputEl.value.trim().replace(/^0x/i, '').padStart(2, '0').slice(-2);
  if (!/^[0-9a-fA-F]{2}$/.test(clean)) {
    outputError(demo, 'Enter exactly one byte in hex (00-ff)');
    return;
  }

  const x = parseInt(clean, 16);
  const y = ARIA_SB1[x];
  const z = ARIA_IS1[y];

  demo.innerHTML = `
    <span class="step">Input: <strong>${clean.toUpperCase()}</strong></span>
    <span class="arrow">→</span>
    <span class="step">S1(${clean.toUpperCase()}) = <strong>${y.toString(16).padStart(2, '0').toUpperCase()}</strong></span>
    <span class="arrow">→</span>
    <span class="step">S1⁻¹(S1(x)) = <strong class="highlight">${z.toString(16).padStart(2, '0').toUpperCase()}</strong></span>
  `;
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
