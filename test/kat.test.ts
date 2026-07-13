import { describe, it, expect } from 'vitest';
import { CIPHERS } from '../src/ciphers/registry';
import { KNOWN_ANSWER_TESTS } from '../src/ciphers/test-vectors';
import { ariaDiffusion, ARIA_SB1, ARIA_IS1, Aria } from '../src/ciphers/aria';
import { Camellia } from '../src/ciphers/camellia';
import { Kuznyechik } from '@li0ard/kuznyechik';
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

// Encrypt/decrypt must round-trip at the block level for the three custom classes.
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
