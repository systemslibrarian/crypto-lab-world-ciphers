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

Five exhibits: Camellia-256 with AES side-by-side comparison, ARIA-256 with involutory S-box visualizer, SM4 with post-quantum key-size warning and geopolitical context, Kuznyechik with S-box controversy documentation, and a four-way comparison table with decision tree. All cipher outputs are real operations - no simulation.

## 4. How to Run Locally
```bash
git clone https://github.com/systemslibrarian/crypto-lab-world-ciphers
cd crypto-lab-world-ciphers
npm install
npm run dev
```

## 5. Part of the Crypto-Lab Suite
Part of [crypto-lab](https://systemslibrarian.github.io/crypto-lab/) - browser-based cryptography demos spanning 2,500 years of cryptographic history to NIST FIPS 2024 post-quantum standards.

So whether you eat or drink or whatever you do, do it all for the glory of God. - 1 Corinthians 10:31