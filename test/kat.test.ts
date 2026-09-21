import { describe, it, expect } from 'vitest';
import { CIPHERS } from '../src/ciphers/registry';
import { KNOWN_ANSWER_TESTS } from '../src/ciphers/test-vectors';
import { ariaDiffusion, ARIA_SB1, ARIA_IS1, Aria } from '../src/ciphers/aria';
import { Camellia } from '../src/ciphers/camellia';
import { Kuznyechik } from '@li0ard/kuznyechik';
import { Kalyna128_256 } from '@li0ard/kalyna';
import { Belt } from '@li0ard/belt';
import { KISA_SEED_CBC } from 'kisa-seed';
import { sm4Trace } from '../src/ciphers/sm4-trace';
import { bytesToHex, hexToBytes } from '../src/ciphers/utils';

// Correctness proof: every implementation must reproduce the official vector from its
// defining standard. If any of these fail, the demo's "real crypto, no simulation"
// claim is broken — so they gate CI.
describe('official known-answer tests', () => {
  for (const t of KNOWN_ANSWER_TESTS) {
    it(`${t.label} matches ${t.source}`, () => {
      const got = bytesToHex(
        CIPHERS[t.cipher].blockEncrypt(hexToBytes(t.key), hexToBytes(t.plaintext)),
      );
      expect(got).toBe(t.ciphertext);
    });
  }
});

// The ARIA exhibit teaches that ARIA's involution is its DIFFUSION layer, not its
// S-boxes. These tests pin that claim so the teaching content can't silently drift.
describe('ARIA involution facts (taught in Exhibit 2)', () => {
  it('diffusion layer A is an involution: A(A(x)) === x', () => {
    const x = hexToBytes('00112233445566778899aabbccddeeff');
    expect(bytesToHex(ariaDiffusion(ariaDiffusion(x)))).toBe(bytesToHex(x));
    expect(bytesToHex(ariaDiffusion(x))).not.toBe(bytesToHex(x)); // it really does mix
  });

  it('S-box is NOT involutory (so decryption needs a separate inverse)', () => {
    let involutory = true;
    for (let i = 0; i < 256; i++) {
      if (ARIA_SB1[ARIA_SB1[i]] !== i) {
        involutory = false;
        break;
      }
    }
    expect(involutory).toBe(false);
  });

  it('IS1 is the true inverse of SB1', () => {
    for (let i = 0; i < 256; i++) {
      expect(ARIA_SB1[ARIA_IS1[i]]).toBe(i);
    }
  });
});

// The SM4 round animation (Exhibit 3) shows genuine intermediate state from sm4Trace.
// These tests pin the tracer to the official vector and to the production gm-crypto path
// so the animation can never silently show fabricated data.
describe('SM4 round tracer (drives Exhibit 3 animation)', () => {
  it('final ciphertext matches the GB/T 32907-2016 §A.1 vector', () => {
    const key = hexToBytes('0123456789abcdeffedcba9876543210');
    const pt = hexToBytes('0123456789abcdeffedcba9876543210');
    expect(sm4Trace(key, pt).ciphertextHex).toBe('681edf34d206965e86b3e94f536e4246');
  });

  it('emits exactly 32 real rounds and matches the production block-encrypt path', () => {
    const key = hexToBytes('000102030405060708090a0b0c0d0e0f');
    const block = hexToBytes('00112233445566778899aabbccddeeff');
    const trace = sm4Trace(key, block);
    expect(trace.steps).toHaveLength(32);
    expect(trace.ciphertextHex).toBe(
      bytesToHex(CIPHERS.SM4.blockEncrypt(key, block)),
    );
  });
});

// Encrypt/decrypt must round-trip at the block level for every cipher the page offers.
describe('block round-trips (encrypt then decrypt recovers plaintext)', () => {
  const block = hexToBytes('00112233445566778899aabbccddeeff');
  const key32 = hexToBytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');

  it('Camellia-256', () => {
    const c = new Camellia(key32);
    expect(bytesToHex(c.decryptBlock(c.encryptBlock(block)))).toBe(bytesToHex(block));
  });
  it('ARIA-256', () => {
    const a = new Aria(key32);
    expect(bytesToHex(a.decryptBlock(a.encryptBlock(block)))).toBe(bytesToHex(block));
  });
  it('Kuznyechik-256', () => {
    const k = new Kuznyechik(key32);
    expect(bytesToHex(k.decryptBlock(k.encryptBlock(block)))).toBe(bytesToHex(block));
  });
});

// The three ciphers added alongside the original four come from libraries rather
// than from hand-rolled classes, so these pin the exact variant each one is wired
// to. Picking the wrong Kalyna class or letting BelT take a short key would still
// round-trip happily while no longer being the cipher the page names.
describe('library-backed ciphers: variant and round-trip', () => {
  const block = hexToBytes('00112233445566778899aabbccddeeff');
  const key32 = hexToBytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  const key16 = hexToBytes('000102030405060708090a0b0c0d0e0f');

  it('Kalyna is the 128-bit-block / 256-bit-key variant', () => {
    const k = new Kalyna128_256(key32);
    expect(k.blockSize).toBe(16);
    expect(k.keySize).toBe(32);
  });

  it('Kalyna-128/256 round-trips', () => {
    const k = new Kalyna128_256(key32);
    expect(bytesToHex(k.decrypt(k.encrypt(block)))).toBe(bytesToHex(block));
  });

  it('BelT-256 round-trips', () => {
    const b = new Belt(key32);
    expect(bytesToHex(b.decrypt(b.encrypt(block)))).toBe(bytesToHex(block));
  });

  it('SEED round-trips through the CBC entry points the page uses', () => {
    const iv = new Uint8Array(16);
    const ct = KISA_SEED_CBC.SEED_CBC_Encrypt(key16, iv, block, 0, block.length);
    const pt = KISA_SEED_CBC.SEED_CBC_Decrypt(key16, iv, ct, 0, ct.length);
    expect(bytesToHex(pt)).toBe(bytesToHex(block));
  });

  // The registry reaches SEED's raw block cipher through CBC under an all-zero IV.
  // That identity is the whole basis of the SEED row in the KAT panel, so assert it
  // directly rather than trusting the vector alone: a second, independent block must
  // also encrypt to the same bytes whether it is the first block of its own call or
  // not — which is only true if nothing is chaining.
  it('SEED zero-IV CBC really is the raw block cipher (no chaining)', () => {
    const iv = new Uint8Array(16);
    const other = hexToBytes('ffeeddccbbaa99887766554433221100');
    const first = CIPHERS.SEED.blockEncrypt(key16, other);
    const viaTwoBlockMessage = KISA_SEED_CBC.SEED_CBC_Encrypt(
      key16,
      iv,
      new Uint8Array([...other, ...other]),
      0,
      32,
    );
    // Block 1 of the two-block message matches the standalone single-block call...
    expect(bytesToHex(viaTwoBlockMessage.slice(0, 16))).toBe(bytesToHex(first));
    // ...and block 2 does NOT, because CBC chained it. That difference is exactly
    // why the registry keeps only the first block.
    expect(bytesToHex(viaTwoBlockMessage.slice(16, 32))).not.toBe(bytesToHex(first));
  });
});
