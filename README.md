# crypto-lab-world-ciphers

## What It Is
World Ciphers demonstrates four national symmetric block ciphers: Camellia-256 (Japan, NTT/Mitsubishi, 2000), ARIA-256 (South Korea, NSRI, 2003), SM4 (China, OSCCA, 2006), and Kuznyechik (Russia, FSB, 2015). All four share AES's 128-bit block size, but each was designed independently as a sovereign cryptographic standard for government and regulatory use. Only Camellia and SM4 are in ISO/IEC 18033-3 (SM4 via Amendment 1:2021); ARIA is standardized in KS X 1213 and RFC 5794 but not in 18033-3, and the amendment that would have added Kuznyechik was withdrawn over its S-box design concerns. The security model is symmetric block cipher: the same key encrypts and decrypts, with security grounded in the computational hardness of inverting the cipher without the key.

## When to Use It
- Camellia-256: AES-equivalent alternative with full design transparency, TLS support, and CRYPTREC endorsement — the strongest general-purpose pick from this group.
- ARIA-256: Required for Korean government and financial system compliance.
- SM4: Required for products operating in Chinese markets under Chinese law.
- Kuznyechik: Required for Russian GOST R 34.12-2015 compliance only.
- Do not use SM4 alone for long-term data — its 128-bit key gives roughly 64-bit post-quantum security, below NIST's recommended 128-bit post-quantum threshold.
- Do not use Kuznyechik outside of Russian compliance requirements — S-box design transparency concerns are unresolved.
- None of these replace AES-256-GCM as a general-purpose default.
- Do NOT treat this as a production crypto library — it is a teaching demo that implements these ciphers to compare them, not a hardened deployment.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-world-ciphers](https://systemslibrarian.github.io/crypto-lab-world-ciphers/)**

All cipher outputs are real operations — no simulation. To prove it, the page opens with a **live known-answer test (KAT)** that encrypts each cipher's official vector (RFC 3713, RFC 5794, GB/T 32907-2016, GOST R 34.12-2015) in your browser and checks it byte-for-byte against the published ciphertext. The same vectors gate `npm test`.

The demo now opens with a **Start Here** vocabulary panel that defines block, key, round, S-box, SPN, Feistel, involution, and diffusion layer in one plain sentence each, and every jargon term in the exhibits links back to it. Exhibits are:

1. **Verified** — the live KAT panel described above, with a pass count and a re-run button.
2. **Camellia-256** — interactive encrypt/decrypt with AES-256-CBC side by side, plus a stated takeaway: different ciphertext for identical inputs means the two parties must agree on the algorithm to interoperate, and "different-looking output" is not evidence of more security.
3. **ARIA-256** — shows where ARIA's involution actually lives (the diffusion layer, not the S-boxes), with involution defined plainly up front and an **animated 16×16 S-box lookup** that traces S₁, then S₁ again (landing elsewhere — the proof it is not an involution), then S₁⁻¹ back to the input.
4. **SM4** — the honest post-quantum key-size warning and geopolitical context, plus a **round animation** that runs the genuine 32-round Feistel/T-transform pipeline (substitute → mix → add-round-key) over the live state you just encrypted, so the round count is shown, not merely asserted. The animation is driven by a spec-accurate tracer whose final output is checked against the GB/T 32907-2016 vector in `npm test`.
5. **Kuznyechik** — the S-box transparency controversy documented (Biryukov, Perrin & Udovenko, EUROCRYPT 2016; Perrin, IACR ToSC 2019).
6. **Avalanche Effect** — flip one input bit, watch about 50% of ciphertext bits change.
7. **ECB vs CBC** — the raw-block hex view *and* the actual **"ECB penguin" image demonstration**: a small picture is encrypted with a real block cipher, and the ECB ghost survives while CBC turns it to noise.
8. **Four-Way Comparison** — a comparison table with a decision tree.

## What Can Go Wrong
- ECB mode leaks structure: identical plaintext blocks produce identical ciphertext blocks (the "ECB penguin"), so a confidential mode like CBC or an AEAD mode is required.
- SM4's 128-bit key gives only about 64-bit security against Grover-style quantum search, below NIST's 128-bit post-quantum threshold for long-term data.
- Kuznyechik's S-box design transparency concerns (Biryukov, Perrin & Udovenko 2016; Perrin 2019) remain unresolved, which is why it is best confined to mandated compliance use.
- Reaching for a national cipher outside its compliance mandate trades AES's scrutiny and tooling for weaker ecosystem support with no security gain.
- A raw block cipher provides no integrity; without an authenticated mode, ciphertext can be tampered with undetected, and IV/nonce reuse in CBC further degrades confidentiality.

## Real-World Usage
- Camellia-256 is endorsed by CRYPTREC, standardized in TLS cipher suites, and used as an AES alternative in Japan.
- ARIA-256 is mandated for South Korean government and financial-sector systems.
- SM4 is required for products in Chinese markets and is used in Chinese TLS (TLCP) and PKI under Chinese cryptography law.
- Kuznyechik is required for Russian GOST R 34.12-2015 compliance.
- Camellia and SM4 are standardized under ISO/IEC 18033-3 (SM4 by Amendment 1:2021); ARIA and Kuznyechik are not, though all four serve as sovereign national standards at home.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-world-ciphers
cd crypto-lab-world-ciphers
npm install
npm run dev
```

## Related Demos
- [crypto-lab-world-hashes](https://systemslibrarian.github.io/crypto-lab-world-hashes/) — the hashing counterpart: SM3, Streebog, and Kupyna national hash standards.
- [crypto-lab-aes-modes](https://systemslibrarian.github.io/crypto-lab-aes-modes/) — block-cipher modes (ECB/CBC/GCM) and why authenticated encryption matters.
- [crypto-lab-iron-serpent](https://systemslibrarian.github.io/crypto-lab-iron-serpent/) — Serpent, another AES-finalist-class SPN block cipher.
- [crypto-lab-chacha20-stream](https://systemslibrarian.github.io/crypto-lab-chacha20-stream/) — a modern stream cipher and the cost of nonce reuse.
- [crypto-lab-ascon](https://systemslibrarian.github.io/crypto-lab-ascon/) — the NIST lightweight AEAD standard, a different design point.

---

*Part of the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
