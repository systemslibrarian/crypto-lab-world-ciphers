// Uniform single-block encryption interface across all seven ciphers.
// Used by the live KAT check, the avalanche demo, and the ECB-vs-CBC demo so each
// feature works identically for every cipher instead of special-casing them.

import { SM4 } from 'gm-crypto';
import { Kuznyechik } from '@li0ard/kuznyechik';
import { Kalyna128_256 } from '@li0ard/kalyna';
import { Belt } from '@li0ard/belt';
import { KISA_SEED_CBC } from 'kisa-seed';
import { Aria } from './aria';
import { Camellia } from './camellia';
import { bytesToHex, hexToBytes } from './utils';

export interface CipherSpec {
  /** Display name, e.g. "Camellia-256". */
  name: string;
  /** Country flag emoji. */
  flag: string;
  /** Default key length for interactive demos, in bytes. */
  keyBytes: number;
  /** Encrypt one 16-byte block. Key length is validated by the underlying cipher. */
  blockEncrypt: (key: Uint8Array, block: Uint8Array) => Uint8Array;
}

// gm-crypto pads with PKCS#7, so a single 16-byte block yields two ciphertext blocks
// (the data block + a full pad block). We keep only the first — the raw block cipher output.
const sm4BlockEncrypt = (key: Uint8Array, block: Uint8Array): Uint8Array => {
  const ctHex = SM4.encrypt(bytesToHex(block), bytesToHex(key), {
    mode: SM4.constants.ECB,
    inputEncoding: 'hex',
    outputEncoding: 'hex',
  }) as string;
  return hexToBytes(ctHex.slice(0, 32));
};

// kisa-seed exposes only its CBC entry points — the raw-block helpers take a
// KISA_SEED_INFO/KISA_SEED_KEY the package does not export. CBC under an
// all-zero IV reduces to the raw block cipher for the FIRST block, because
// C1 = E(P1 XOR IV) = E(P1). Like SM4 above, the library also appends a full
// PKCS#7 pad block, so the output is 32 bytes and we keep only the first 16.
// The first-block-only slice is what makes this a block-cipher call and not a
// mode: nothing here ever chains, so no later block borrows a previous one.
const SEED_ZERO_IV = new Uint8Array(16);
const seedBlockEncrypt = (key: Uint8Array, block: Uint8Array): Uint8Array =>
  KISA_SEED_CBC.SEED_CBC_Encrypt(key, SEED_ZERO_IV, block, 0, block.length).slice(0, 16);

export const CIPHERS: Record<CipherSpec['name'] | string, CipherSpec> = {
  Camellia: {
    name: 'Camellia-256',
    flag: '🇯🇵',
    keyBytes: 32,
    blockEncrypt: (k, b) => new Camellia(k).encryptBlock(b),
  },
  ARIA: {
    name: 'ARIA-256',
    flag: '🇰🇷',
    keyBytes: 32,
    blockEncrypt: (k, b) => new Aria(k).encryptBlock(b),
  },
  SM4: {
    name: 'SM4',
    flag: '🇨🇳',
    keyBytes: 16,
    blockEncrypt: sm4BlockEncrypt,
  },
  Kuznyechik: {
    name: 'Kuznyechik',
    flag: '🇷🇺',
    keyBytes: 32,
    blockEncrypt: (k, b) => new Kuznyechik(k).encryptBlock(b),
  },
  Kalyna: {
    name: 'Kalyna-128/256',
    flag: '🇺🇦',
    keyBytes: 32,
    blockEncrypt: (k, b) => new Kalyna128_256(k).encrypt(b),
  },
  BelT: {
    name: 'BelT-256',
    flag: '🇧🇾',
    keyBytes: 32,
    blockEncrypt: (k, b) => new Belt(k).encrypt(b),
  },
  SEED: {
    name: 'SEED',
    flag: '🇰🇷',
    keyBytes: 16,
    blockEncrypt: seedBlockEncrypt,
  },
};

export const CIPHER_KEYS = [
  'Camellia',
  'ARIA',
  'SM4',
  'Kuznyechik',
  'Kalyna',
  'BelT',
  'SEED',
] as const;
export type CipherKey = (typeof CIPHER_KEYS)[number];
