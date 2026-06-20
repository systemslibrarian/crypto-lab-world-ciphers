// Uniform single-block encryption interface across all four ciphers.
// Used by the live KAT check, the avalanche demo, and the ECB-vs-CBC demo so each
// feature works identically for every cipher instead of special-casing them.

import { SM4 } from 'gm-crypto';
import { Kuznyechik } from '@li0ard/kuznyechik';
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
};

export const CIPHER_KEYS = ['Camellia', 'ARIA', 'SM4', 'Kuznyechik'] as const;
export type CipherKey = (typeof CIPHER_KEYS)[number];
