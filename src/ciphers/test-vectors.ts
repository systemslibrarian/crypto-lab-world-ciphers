// Official known-answer test (KAT) vectors for the seven national block ciphers.
// Each is a single raw-block (ECB, no padding) encryption: E(key, plaintext) === ciphertext.
// These are the canonical vectors published in each cipher's defining standard, so they
// double as a correctness proof: the live demo runs them in your browser (Exhibit 0) and
// the repo test suite checks them under `npm test`. Sources are cited per entry.

export interface KnownAnswerTest {
  cipher: 'Camellia' | 'ARIA' | 'SM4' | 'Kuznyechik' | 'Kalyna' | 'BelT' | 'SEED';
  label: string;
  keyBits: number;
  key: string; // hex
  plaintext: string; // hex (16 bytes / 128-bit block)
  ciphertext: string; // hex (expected)
  source: string;
}

export const KNOWN_ANSWER_TESTS: KnownAnswerTest[] = [
  // --- Camellia: RFC 3713, Appendix A ---
  {
    cipher: 'Camellia',
    label: 'Camellia-128',
    keyBits: 128,
    key: '0123456789abcdeffedcba9876543210',
    plaintext: '0123456789abcdeffedcba9876543210',
    ciphertext: '67673138549669730857065648eabe43',
    source: 'RFC 3713 §A',
  },
  {
    cipher: 'Camellia',
    label: 'Camellia-192',
    keyBits: 192,
    key: '0123456789abcdeffedcba98765432100011223344556677',
    plaintext: '0123456789abcdeffedcba9876543210',
    ciphertext: 'b4993401b3e996f84ee5cee7d79b09b9',
    source: 'RFC 3713 §A',
  },
  {
    cipher: 'Camellia',
    label: 'Camellia-256',
    keyBits: 256,
    key: '0123456789abcdeffedcba98765432100011223344556677 8899aabbccddeeff'.replace(/ /g, ''),
    plaintext: '0123456789abcdeffedcba9876543210',
    ciphertext: '9acc237dff16d76c20ef7c919e3a7509',
    source: 'RFC 3713 §A',
  },

  // --- ARIA: RFC 5794, test vectors ---
  {
    cipher: 'ARIA',
    label: 'ARIA-128',
    keyBits: 128,
    key: '000102030405060708090a0b0c0d0e0f',
    plaintext: '00112233445566778899aabbccddeeff',
    ciphertext: 'd718fbd6ab644c739da95f3be6451778',
    source: 'RFC 5794',
  },
  {
    cipher: 'ARIA',
    label: 'ARIA-256',
    keyBits: 256,
    key: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    plaintext: '00112233445566778899aabbccddeeff',
    ciphertext: 'f92bd7c79fb72e2f2b8f80c1972d24fc',
    source: 'RFC 5794',
  },

  // --- SM4: GB/T 32907-2016, Appendix A.1 ---
  {
    cipher: 'SM4',
    label: 'SM4-128',
    keyBits: 128,
    key: '0123456789abcdeffedcba9876543210',
    plaintext: '0123456789abcdeffedcba9876543210',
    ciphertext: '681edf34d206965e86b3e94f536e4246',
    source: 'GB/T 32907-2016 §A.1',
  },

  // --- Kuznyechik: GOST R 34.12-2015 / RFC 7801 ---
  {
    cipher: 'Kuznyechik',
    label: 'Kuznyechik-256',
    keyBits: 256,
    key: '8899aabbccddeeff0011223344556677fedcba98765432100123456789abcdef',
    plaintext: '1122334455667700ffeeddccbbaa9988',
    ciphertext: '7f679d90bebc24305a468d42b9d4edcd',
    source: 'GOST R 34.12-2015 / RFC 7801',
  },

  // --- Kalyna: DSTU 7624:2014, Annex B (test vectors), B.2.7 ---
  // "Encryption/decryption: 128-bit block with 256-bit key", read from the
  // standard's own English translation by its authors (Oliynykov et al.,
  // IACR ePrint 2015/650, which states it is "the adapted English translated
  // specification of Kalyna as it is given in the national standard").
  {
    cipher: 'Kalyna',
    label: 'Kalyna-128/256',
    keyBits: 256,
    key: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    plaintext: '202122232425262728292a2b2c2d2e2f',
    ciphertext: '58ec3e091000158a1148f7166f334f14',
    source: 'DSTU 7624:2014 Annex B, B.2.7',
  },

  // --- BelT: STB 34.101.31-2020, Annex A (Proverochnye primery), A.1, Table A.1 ---
  // A.1 is titled "Shifrovanie bloka" (block encryption); Table A.1 gives X, K, Y
  // for a single belt-block call under a 256-bit key.
  {
    cipher: 'BelT',
    label: 'BelT-256',
    keyBits: 256,
    key: 'e9dee72c8f0c0fa62ddb49f46f73964706075316ed247a3739cba38303a98bf6',
    plaintext: 'b194bac80a08f53b366d008e584a5de4',
    ciphertext: '69cca1c93557c9e3d66bc3e0fa88fa6e',
    source: 'STB 34.101.31-2020 Annex A, A.1',
  },

  // --- SEED: RFC 4269, Appendix B (Test Vectors), B.1 ---
  {
    cipher: 'SEED',
    label: 'SEED-128',
    keyBits: 128,
    key: '00000000000000000000000000000000',
    plaintext: '000102030405060708090a0b0c0d0e0f',
    ciphertext: '5ebac6e0054e166819aff1cc6d346cdb',
    source: 'RFC 4269 Appendix B.1',
  },
];
