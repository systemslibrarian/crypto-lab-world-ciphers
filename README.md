# crypto-lab-world-ciphers

## 1. What It Is
World Ciphers demonstrates four national symmetric block ciphers: Camellia-256 (Japan, NTT/Mitsubishi, 2000), ARIA-256 (South Korea, NSRI, 2003), SM4 (China, OSCCA, 2006), and Kuznyechik (Russia, FSB, 2015). All four share AES's 128-bit block size and are standardized under ISO/IEC 18033-3, but each was designed independently as a sovereign cryptographic standard for government and regulatory use. The security model is symmetric block cipher: the same key encrypts and decrypts, with security grounded in the computational hardness of inverting the cipher without the key.

## 2. When to Use It
- ✅ Camellia-256: AES-equivalent alternative with full design transparency, TLS support, and CRYPTREC endorsement - the strongest general-purpose pick from this group
- ✅ ARIA-256: Required for Korean government and financial system compliance
- ✅ SM4: Required for products operating in Chinese markets under Chinese law
- ✅ Kuznyechik: Required for Russian GOST R 34.12-2015 compliance only
- ❌ Do not use SM4 alone for long-term data - 128-bit key gives ~64-bit post-quantum security, below NIST's recommended 128-bit PQ threshold
- ❌ Do not use Kuznyechik outside of Russian compliance requirements - S-box design transparency concerns are unresolved
- ❌ None of these replace AES-256-GCM as a general-purpose default

## 3. Live Demo
Link: https://systemslibrarian.github.io/crypto-lab-world-ciphers/

All cipher outputs are real operations — no simulation. To prove it, the page opens with a
**live known-answer test (KAT)** that encrypts each cipher's official vector (RFC 3713, RFC 5794,
GB/T 32907-2016, GOST R 34.12-2015) in your browser and checks it byte-for-byte against the
published ciphertext. The same vectors gate `npm test`.

Exhibits:
- **Verified** — live KAT panel confirming every implementation matches its standard
- **Camellia-256** — interactive encrypt/decrypt with AES-256-CBC side-by-side
- **ARIA-256** — where ARIA's involution *actually* lives: its diffusion layer is involutory (A(A(x)) = x), its S-boxes are not
- **SM4** — post-quantum key-size warning (with the honest Grover nuance) and geopolitical context
- **Kuznyechik** — Perrin et al. (2019) S-box transparency controversy, documented
- **Avalanche Effect** — flip one input bit, watch ≈50% of ciphertext bits change, for any of the four
- **ECB vs CBC** — the "ECB penguin" failure: identical plaintext blocks leak through ECB, vanish under CBC
- **Four-Way Comparison** — table (with accurate TLS/IETF status) plus a decision tree

## 4. How to Run Locally
```bash
git clone https://github.com/systemslibrarian/crypto-lab-world-ciphers
cd crypto-lab-world-ciphers
npm install
npm run dev      # start the dev server
npm test         # verify all four ciphers against official test vectors
npm run build    # type-check and produce a production build
```

## 5. Part of the Crypto-Lab Suite
Part of [crypto-lab](https://systemslibrarian.github.io/crypto-lab/) - browser-based cryptography demos spanning 2,500 years of cryptographic history to NIST FIPS 2024 post-quantum standards.

So whether you eat or drink or whatever you do, do it all for the glory of God. - 1 Corinthians 10:31