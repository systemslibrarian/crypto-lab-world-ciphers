// Camellia block cipher — TypeScript implementation
// Based on RFC 3713 and the mbedTLS reference (Apache 2.0)
// NTT & Mitsubishi Electric, 2000
// 128-bit block, 128/192/256-bit keys

// S-box from Camellia specification (FSb) — all 256 entries
const FSb = new Uint8Array([
  112,130, 44,236,179, 39,192,229,228,133, 87, 53,234, 12,174, 65,
   35,239,107,147, 69, 25,165, 33,237, 14, 79, 78, 29,101,146,189,
  134,184,175,143,124,235, 31,206, 62, 48,220, 95, 94,197, 11, 26,
  166,225, 57,202,213, 71, 93, 61,217,  1, 90,214, 81, 86,108, 77,
  139, 13,154,102,251,204,176, 45,116, 18, 43, 32,240,177,132,153,
  223, 76,203,194, 52,126,118,  5,109,183,169, 49,209, 23,  4,215,
   20, 88, 58, 97,222, 27, 17, 28, 50, 15,156, 22, 83, 24,242, 34,
  254, 68,207,178,195,181,122,145, 36,  8,232,168, 96,252,105, 80,
  170,208,160,125,161,137, 98,151, 84, 91, 30,149,224,255,100,210,
   16,196,  0, 72,163,247,117,219,138,  3,230,218,  9, 63,221,148,
  135, 92,131,  2,205, 74,144, 51,115,103,246,243,157,127,191,226,
   82,155,216, 38,200, 55,198, 59,129,150,111, 75, 19,190, 99, 46,
  233,121,167,140,159,110,188,142, 41,245,249,182, 47,253,180, 89,
  120,152,  6,106,231, 70,113,186,212, 37,171, 66,136,162,141,250,
  114,  7,185, 85,248,238,172, 10, 54, 73, 42,104, 60, 56,241,164,
   64, 40,211,123,187,201, 67,193, 21,227,173,244,119,199,128,158
]);

function SBOX1(n: number): number { return FSb[n]; }
function SBOX2(n: number): number { return ((FSb[n] >>> 7) | (FSb[n] << 1)) & 0xff; }
function SBOX3(n: number): number { return ((FSb[n] >>> 1) | (FSb[n] << 7)) & 0xff; }
function SBOX4(n: number): number { return FSb[((n << 1) | (n >>> 7)) & 0xff]; }

const SIGMA_CHARS = [
  [0xa0,0x9e,0x66,0x7f,0x3b,0xcc,0x90,0x8b],
  [0xb6,0x7a,0xe8,0x58,0x4c,0xaa,0x73,0xb2],
  [0xc6,0xef,0x37,0x2f,0xe9,0x4f,0x82,0xbe],
  [0x54,0xff,0x53,0xa5,0xf1,0xd3,0x6f,0x1c],
  [0x10,0xe5,0x27,0xfa,0xde,0x68,0x2d,0x1d],
  [0xb0,0x56,0x88,0xc2,0xb3,0xe6,0xc1,0xfd]
];

function getBE32(buf: number[], off: number): number {
  return ((buf[off] << 24) | (buf[off+1] << 16) | (buf[off+2] << 8) | buf[off+3]) >>> 0;
}
function getBE32a(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off+1] << 16) | (buf[off+2] << 8) | buf[off+3]) >>> 0;
}
function putBE32(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >>> 24) & 0xff;
  buf[off+1] = (val >>> 16) & 0xff;
  buf[off+2] = (val >>> 8) & 0xff;
  buf[off+3] = val & 0xff;
}

function BYTE0(x: number): number { return x & 0xff; }
function BYTE1(x: number): number { return (x >>> 8) & 0xff; }
function BYTE2(x: number): number { return (x >>> 16) & 0xff; }
function BYTE3(x: number): number { return (x >>> 24) & 0xff; }

function camelliaFeistel(X: Uint32Array, xo: number, K: Uint32Array, ko: number, Z: Uint32Array, zo: number): void {
  let I0 = (X[xo] ^ K[ko]) >>> 0;
  let I1 = (X[xo+1] ^ K[ko+1]) >>> 0;
  I0 = ((SBOX1(BYTE3(I0)) << 24) | (SBOX2(BYTE2(I0)) << 16) | (SBOX3(BYTE1(I0)) << 8) | SBOX4(BYTE0(I0))) >>> 0;
  I1 = ((SBOX2(BYTE3(I1)) << 24) | (SBOX3(BYTE2(I1)) << 16) | (SBOX4(BYTE1(I1)) << 8) | SBOX1(BYTE0(I1))) >>> 0;
  I0 = (I0 ^ (((I1 << 8) | (I1 >>> 24)) >>> 0)) >>> 0;
  I1 = (I1 ^ (((I0 << 16) | (I0 >>> 16)) >>> 0)) >>> 0;
  I0 = (I0 ^ (((I1 >>> 8) | (I1 << 24)) >>> 0)) >>> 0;
  I1 = (I1 ^ (((I0 >>> 8) | (I0 << 24)) >>> 0)) >>> 0;
  Z[zo] = (Z[zo] ^ I1) >>> 0;
  Z[zo+1] = (Z[zo+1] ^ I0) >>> 0;
}

function FL(XL: number, XR: number, KL: number, KR: number): [number, number] {
  XR = ((((((XL & KL) >>> 0) << 1) | (((XL & KL) >>> 0) >>> 31)) >>> 0) ^ XR) >>> 0;
  XL = (((XR | KR) >>> 0) ^ XL) >>> 0;
  return [XL, XR];
}
function FLInv(YL: number, YR: number, KL: number, KR: number): [number, number] {
  YL = (((YR | KR) >>> 0) ^ YL) >>> 0;
  YR = ((((((YL & KL) >>> 0) << 1) | (((YL & KL) >>> 0) >>> 31)) >>> 0) ^ YR) >>> 0;
  return [YL, YR];
}

const shifts: number[][][] = [
  [[1,1,1,1],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
  [[1,0,1,1],[1,1,0,1],[1,1,1,0],[1,1,0,1]]
];
const indexes: number[][][] = [
  [
    [ 0, 1, 2, 3, 8, 9,10,11,38,39,36,37,23,20,21,22,27,-1,-1,26],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [ 4, 5, 6, 7,12,13,14,15,16,17,18,19,-1,24,25,-1,31,28,29,30],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1]
  ],
  [
    [ 0, 1, 2, 3,61,62,63,60,-1,-1,-1,-1,27,24,25,26,35,32,33,34],
    [-1,-1,-1,-1, 8, 9,10,11,16,17,18,19,-1,-1,-1,-1,39,36,37,38],
    [-1,-1,-1,-1,12,13,14,15,58,59,56,57,31,28,29,30,-1,-1,-1,-1],
    [ 4, 5, 6, 7,65,66,67,64,20,21,22,23,-1,-1,-1,-1,43,40,41,42]
  ]
];
const transposes: number[][] = [
  [21,22,23,20,-1,-1,-1,-1,18,19,16,17,11, 8, 9,10,15,12,13,14],
  [25,26,27,24,29,30,31,28,18,19,16,17,-1,-1,-1,-1,-1,-1,-1,-1]
];

function ROTL(dest: Uint32Array, dOff: number, src: Uint32Array, sOff: number, shift: number): void {
  dest[dOff]   = ((src[sOff]   << shift) | (src[sOff+1] >>> (32 - shift))) >>> 0;
  dest[dOff+1] = ((src[sOff+1] << shift) | (src[sOff+2] >>> (32 - shift))) >>> 0;
  dest[dOff+2] = ((src[sOff+2] << shift) | (src[sOff+3] >>> (32 - shift))) >>> 0;
  dest[dOff+3] = ((src[sOff+3] << shift) | (src[sOff]   >>> (32 - shift))) >>> 0;
}

interface CamelliaCtx { nr: number; rk: Uint32Array; }

function setKeyEnc(key: Uint8Array, keybits: number): CamelliaCtx {
  const ctx: CamelliaCtx = { nr: 0, rk: new Uint32Array(68) };
  const RK = ctx.rk;
  const t = new Uint8Array(64);
  const idx = keybits === 128 ? 0 : 1;
  ctx.nr = keybits === 128 ? 3 : 4;

  for (let i = 0; i < keybits / 8; i++) t[i] = key[i];
  if (keybits === 192) for (let i = 0; i < 8; i++) t[24+i] = (~t[16+i]) & 0xff;

  const SIGMA = new Uint32Array(12);
  for (let i = 0; i < 6; i++) {
    SIGMA[i*2]   = getBE32(SIGMA_CHARS[i], 0);
    SIGMA[i*2+1] = getBE32(SIGMA_CHARS[i], 4);
  }

  const KC = new Uint32Array(16);
  for (let i = 0; i < 8; i++) KC[i] = getBE32a(t, i * 4);

  for (let i = 0; i < 4; i++) KC[8+i] = (KC[i] ^ KC[4+i]) >>> 0;
  camelliaFeistel(KC, 8, SIGMA, 0, KC, 10);
  camelliaFeistel(KC, 10, SIGMA, 2, KC, 8);
  for (let i = 0; i < 4; i++) KC[8+i] = (KC[8+i] ^ KC[i]) >>> 0;
  camelliaFeistel(KC, 8, SIGMA, 4, KC, 10);
  camelliaFeistel(KC, 10, SIGMA, 6, KC, 8);

  if (keybits > 128) {
    for (let i = 0; i < 4; i++) KC[12+i] = (KC[4+i] ^ KC[8+i]) >>> 0;
    camelliaFeistel(KC, 12, SIGMA, 8, KC, 14);
    camelliaFeistel(KC, 14, SIGMA, 10, KC, 12);
  }

  const TK = new Uint32Array(20);
  for (let offset = 0; offset < 4; offset++) {
    if ((offset === 1 || offset === 3) && keybits <= 128) continue;
    TK[0] = KC[offset*4]; TK[1] = KC[offset*4+1]; TK[2] = KC[offset*4+2]; TK[3] = KC[offset*4+3];
    for (let i = 1; i <= 4; i++) {
      if (shifts[idx][offset][i-1]) ROTL(TK, i*4, TK, 0, (15*i) % 32);
    }
    for (let i = 0; i < 20; i++) {
      if (indexes[idx][offset][i] !== -1) RK[indexes[idx][offset][i]] = TK[i];
    }
  }

  const base = 32 + 12 * idx;
  for (let i = 0; i < 20; i++) {
    if (transposes[idx][i] !== -1) RK[base+i] = RK[transposes[idx][i]];
  }
  return ctx;
}

function setKeyDec(key: Uint8Array, keybits: number): CamelliaCtx {
  const enc = setKeyEnc(key, keybits);
  const ctx: CamelliaCtx = { nr: enc.nr, rk: new Uint32Array(68) };
  const idx = ctx.nr === 4 ? 1 : 0;
  const RK = ctx.rk;
  const SK = enc.rk;
  let si = 24 * 2 + 8 * idx * 2;
  let ri = 0;
  RK[ri++] = SK[si++]; RK[ri++] = SK[si++]; RK[ri++] = SK[si++]; RK[ri++] = SK[si++];
  si -= 6;
  for (let n = 22 + 8 * idx; n > 0; n--, si -= 4) { RK[ri++] = SK[si++]; RK[ri++] = SK[si++]; }
  si -= 2;
  RK[ri++] = SK[si++]; RK[ri++] = SK[si++]; RK[ri++] = SK[si++]; RK[ri++] = SK[si++];
  return ctx;
}

function cryptEcb(ctx: CamelliaCtx, input: Uint8Array): Uint8Array {
  const output = new Uint8Array(16);
  let NR = ctx.nr;
  let ri = 0;
  const RK = ctx.rk;
  const X = new Uint32Array(4);
  X[0] = getBE32a(input, 0); X[1] = getBE32a(input, 4);
  X[2] = getBE32a(input, 8); X[3] = getBE32a(input, 12);
  X[0] = (X[0] ^ RK[ri++]) >>> 0; X[1] = (X[1] ^ RK[ri++]) >>> 0;
  X[2] = (X[2] ^ RK[ri++]) >>> 0; X[3] = (X[3] ^ RK[ri++]) >>> 0;

  while (NR) {
    NR--;
    camelliaFeistel(X, 0, RK, ri, X, 2); ri += 2;
    camelliaFeistel(X, 2, RK, ri, X, 0); ri += 2;
    camelliaFeistel(X, 0, RK, ri, X, 2); ri += 2;
    camelliaFeistel(X, 2, RK, ri, X, 0); ri += 2;
    camelliaFeistel(X, 0, RK, ri, X, 2); ri += 2;
    camelliaFeistel(X, 2, RK, ri, X, 0); ri += 2;
    if (NR) {
      const fl = FL(X[0], X[1], RK[ri], RK[ri+1]); X[0] = fl[0]; X[1] = fl[1]; ri += 2;
      const fli = FLInv(X[2], X[3], RK[ri], RK[ri+1]); X[2] = fli[0]; X[3] = fli[1]; ri += 2;
    }
  }

  X[2] = (X[2] ^ RK[ri++]) >>> 0; X[3] = (X[3] ^ RK[ri++]) >>> 0;
  X[0] = (X[0] ^ RK[ri++]) >>> 0; X[1] = (X[1] ^ RK[ri++]) >>> 0;

  putBE32(output, 0, X[2]); putBE32(output, 4, X[3]);
  putBE32(output, 8, X[0]); putBE32(output, 12, X[1]);
  return output;
}

export class Camellia {
  private encCtx: CamelliaCtx;
  private decCtx: CamelliaCtx;
  constructor(key: Uint8Array) {
    const keybits = key.length * 8;
    if (keybits !== 128 && keybits !== 192 && keybits !== 256)
      throw new Error('Camellia: key must be 16, 24, or 32 bytes');
    this.encCtx = setKeyEnc(key, keybits);
    this.decCtx = setKeyDec(key, keybits);
  }
  encryptBlock(block: Uint8Array): Uint8Array {
    if (block.length !== 16) throw new Error('Block must be 16 bytes');
    return cryptEcb(this.encCtx, block);
  }
  decryptBlock(block: Uint8Array): Uint8Array {
    if (block.length !== 16) throw new Error('Block must be 16 bytes');
    return cryptEcb(this.decCtx, block);
  }
  getRounds(): number { return this.encCtx.nr === 3 ? 18 : 24; }
}
