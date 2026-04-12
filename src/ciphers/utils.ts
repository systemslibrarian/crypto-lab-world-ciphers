// Shared utilities for cipher operations

export function hexToBytes(hex: string): Uint8Array {
  hex = hex.replace(/\s/g, '');
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

export function randomHex(nBytes: number): string {
  return bytesToHex(randomBytes(nBytes));
}

// PKCS#7 padding
export function pkcs7Pad(data: Uint8Array, blockSize: number): Uint8Array {
  const padLen = blockSize - (data.length % blockSize);
  const padded = new Uint8Array(data.length + padLen);
  padded.set(data);
  for (let i = data.length; i < padded.length; i++) {
    padded[i] = padLen;
  }
  return padded;
}

export function pkcs7Unpad(data: Uint8Array): Uint8Array {
  if (data.length === 0) throw new Error('Empty data');
  const padLen = data[data.length - 1];
  if (padLen === 0 || padLen > 16) throw new Error('Invalid padding');
  for (let i = data.length - padLen; i < data.length; i++) {
    if (data[i] !== padLen) throw new Error('Invalid padding');
  }
  return data.slice(0, data.length - padLen);
}

// XOR two equal-length byte arrays
export function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

// ECB mode wrapper (for any 128-bit block cipher encrypt/decrypt function)
export function ecbEncrypt(
  blockEncrypt: (block: Uint8Array) => Uint8Array,
  plaintext: Uint8Array
): Uint8Array {
  const padded = pkcs7Pad(plaintext, 16);
  const out = new Uint8Array(padded.length);
  for (let i = 0; i < padded.length; i += 16) {
    const block = padded.slice(i, i + 16);
    out.set(blockEncrypt(block), i);
  }
  return out;
}

export function ecbDecrypt(
  blockDecrypt: (block: Uint8Array) => Uint8Array,
  ciphertext: Uint8Array
): Uint8Array {
  if (ciphertext.length % 16 !== 0) throw new Error('Invalid ciphertext length');
  const out = new Uint8Array(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i += 16) {
    const block = ciphertext.slice(i, i + 16);
    out.set(blockDecrypt(block), i);
  }
  return pkcs7Unpad(out);
}

// CBC mode wrapper
export function cbcEncrypt(
  blockEncrypt: (block: Uint8Array) => Uint8Array,
  plaintext: Uint8Array,
  iv: Uint8Array
): Uint8Array {
  const padded = pkcs7Pad(plaintext, 16);
  const out = new Uint8Array(padded.length);
  let prev = iv;
  for (let i = 0; i < padded.length; i += 16) {
    const block = xorBytes(padded.slice(i, i + 16), prev);
    const encrypted = blockEncrypt(block);
    out.set(encrypted, i);
    prev = encrypted;
  }
  return out;
}

export function cbcDecrypt(
  blockDecrypt: (block: Uint8Array) => Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array
): Uint8Array {
  if (ciphertext.length % 16 !== 0) throw new Error('Invalid ciphertext length');
  const out = new Uint8Array(ciphertext.length);
  let prev = iv;
  for (let i = 0; i < ciphertext.length; i += 16) {
    const block = ciphertext.slice(i, i + 16);
    const decrypted = xorBytes(blockDecrypt(block), prev);
    out.set(decrypted, i);
    prev = block;
  }
  return pkcs7Unpad(out);
}
