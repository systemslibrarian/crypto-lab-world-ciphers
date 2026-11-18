# crypto-lab-world-ciphers

## What It Is
World Ciphers demonstrates seven national symmetric block ciphers: Camellia-256 (Japan, NTT/Mitsubishi, 2000), ARIA-256 (South Korea, NSRI, 2003), SM4 (China, OSCCA, 2006), Kuznyechik (Russia, FSB, 2015), Kalyna-128/256 (Ukraine, DSTU 7624:2014), BelT-256 (Belarus, STB 34.101.31) and SEED (South Korea, KISA, 1998). All seven share AES's 128-bit block size, but each was designed independently as a sovereign cryptographic standard for government and regulatory use. Camellia, SM4 and SEED are in ISO/IEC 18033-3 (SM4 via Amendment 1:2021); ARIA is standardized in KS X 1213 and RFC 5794 but not in 18033-3, the amendment that would have added Kuznyechik was withdrawn over its S-box design concerns, and neither Kalyna nor BelT is in 18033-3 or has an IETF cipher suite. The security model is symmetric block cipher: the same key encrypts and decrypts, with security grounded in the computational hardness of inverting the cipher without the key.

## When to Use It
- Camellia-256: AES-equivalent alternative with full design transparency, TLS support, and CRYPTREC endorsement — the strongest general-purpose pick from this group.
- ARIA-256: Required for Korean government and financial system compliance.
- SM4: Required for products operating in Chinese markets under Chinese law.
- Kuznyechik: Required for Russian GOST R 34.12-2015 compliance only.
- Kalyna-128/256: Required for Ukrainian state information systems; the one cipher here that also defines 256- and 512-bit block sizes.
- BelT-256: Required for Belarusian state information systems.
- SEED: Interoperating with Korean legacy financial and e-commerce software; ARIA is the newer Korean standard and the one to reach for otherwise.
- Do not read SM4's or SEED's fixed 128-bit key as a post-quantum failure, and do not credit it with headroom either: Grover's square-root bound gives an idealized 2⁶⁴ query count against a 128-bit key, not a real attack cost, and NIST sets no 128-bit post-quantum threshold — NIST IR 8547 (final, October 2026) defines post-quantum security Category 1 by key search on a 128-bit block cipher (AES-128). A 256-bit key is the conservative choice for long-lived data, and neither cipher offers one.
- Do not credit a BelT-128 or BelT-192 key with 256-bit strength: BelT's block cipher always takes 256 bits, and a shorter key is expanded into them by a fixed public rule that adds length, not entropy.
- Do not use Kuznyechik outside of Russian compliance requirements — S-box design transparency concerns are unresolved.
- None of these replace AES-256-GCM as a general-purpose default.
- Do NOT treat this as a production crypto library — it is a teaching demo that implements these ciphers to compare them, not a hardened deployment.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-world-ciphers](https://systemslibrarian.github.io/crypto-lab-world-ciphers/)**

All cipher outputs are real operations — no simulation. To prove it, the page opens with a **live known-answer test (KAT)** that encrypts each cipher's official vector in your browser and checks it byte-for-byte against the published ciphertext: RFC 3713 §A (Camellia), RFC 5794 (ARIA), GB/T 32907-2016 §A.1 (SM4), GOST R 34.12-2015 / RFC 7801 (Kuznyechik), DSTU 7624:2014 Annex B §B.2.7 (Kalyna), STB 34.101.31-2020 Annex A §A.1 (BelT) and RFC 4269 Appendix B.1 (SEED). Ten vectors in all. The same vectors gate `npm test`, and `e2e/claims.spec.ts` re-asserts each one against the standard independently of the app's own table.

The demo now opens with a **Start Here** vocabulary panel that defines block, key, round, S-box, SPN, Feistel, involution, and diffusion layer in one plain sentence each, and every jargon term in the exhibits links back to it. Exhibits are:

1. **Verified** — the live KAT panel described above, with a pass count and a re-run button.
2. **Camellia-256** — interactive encrypt/decrypt with AES-256-CBC side by side, plus a stated takeaway: different ciphertext for identical inputs means the two parties must agree on the algorithm to interoperate, and "different-looking output" is not evidence of more security.
3. **ARIA-256** — shows where ARIA's involution actually lives (the diffusion layer, not the S-boxes), with involution defined plainly up front and an **animated 16×16 S-box lookup** that traces S₁, then S₁ again (landing elsewhere — the proof it is not an involution), then S₁⁻¹ back to the input.
4. **SM4** — the honest post-quantum key-size warning and geopolitical context, plus a **round animation** that runs the genuine 32-round Feistel/T-transform pipeline (⊕ round key → substitute → mix → XOR into the oldest word) over the live state you just encrypted, so the round count is shown, not merely asserted. The animation is driven by a spec-accurate tracer whose final output is checked against the GB/T 32907-2016 vector in `npm test`.
5. **Kuznyechik** — the S-box transparency controversy documented (Biryukov, Perrin & Udovenko, EUROCRYPT 2016; Perrin, IACR ToSC 2019).
6. **Kalyna-128/256** — Ukraine's replacement for the Soviet-era GOST 28147-89 it shared with Russia, chosen by an open competition modelled on AES and NESSIE; the only cipher here that whitens with addition modulo 2⁶⁴ rather than XOR, and the only one offering wider blocks.
7. **BelT-256** — Belarus's state standard, and the demo's clearest case of the difference between *unbroken* and *well-studied*: no published concern about its design, and very little independent cryptanalysis either. Also the place the key-expansion trap is shown — 256-bit key schedule, 128 bits of entropy.
8. **SEED** — Korea's older cipher, driven in CBC because that is the mode KISA's own distribution exposes, plus the ecosystem lesson: a cipher no browser implemented was carried by a Microsoft ActiveX plug-in that pinned the Korean consumer web to one browser for over a decade.
9. **Avalanche Effect** — flip one input bit, watch about 50% of ciphertext bits change.
10. **ECB vs CBC** — the raw-block hex view *and* the actual **"ECB penguin" image demonstration**: a small picture is encrypted with a real block cipher, and the ECB ghost survives while CBC turns it to noise.
11. **Seven-Way Comparison** — a comparison table with a decision tree.
12. **National standards panel** — text only: why a national standard has usually meant the same mathematical family with a different construction, parameters and specification owner (SM4 beside AES, SM3 beside SHA-256, SM2 beside ECDSA), and how China's NGCC competition continues that pattern into post-quantum algorithms. See *National standards panel* below.

## What Can Go Wrong
- ECB mode leaks structure: identical plaintext blocks produce identical ciphertext blocks (the "ECB penguin"), so a confidential mode like CBC or an AEAD mode is required.
- SM4's and SEED's fixed 128-bit keys leave no room to grow. Grover's square-root bound gives an idealized 2⁶⁴ query count against a 128-bit key, which is not a real attack cost, and NIST sets no 128-bit post-quantum threshold: NIST IR 8547 (final, October 2026) defines post-quantum security Category 1 by key search on a 128-bit block cipher (AES-128) and expects NIST-approved symmetric primitives with at least 128 bits of classical security to meet at least that category. A 256-bit key is the conservative choice for long-lived data, and neither cipher offers one.
- A cipher with no route into the protocols people actually use gets carried by whatever workaround is available, and the workaround becomes the attack surface. SEED is the worked example: mandated for Korean e-commerce, absent from browsers, delivered by ActiveX for over a decade.
- "No published attacks" is weak evidence when few people have had a reason to attack. BelT and Kalyna are both unbroken and both far less studied than AES or Camellia.
- Kuznyechik's S-box design transparency concerns (Biryukov, Perrin & Udovenko 2016; Perrin 2019) remain unresolved, which is why it is best confined to mandated compliance use.
- Reaching for a national cipher outside its compliance mandate trades AES's scrutiny and tooling for weaker ecosystem support with no security gain.
- A raw block cipher provides no integrity; without an authenticated mode, ciphertext can be tampered with undetected, and IV/nonce reuse in CBC further degrades confidentiality.

**Standards reviewed 15 November 2026:** [NIST IR 8547, *Transition to Post-Quantum Cryptography Standards* (final, October 2026)](https://nvlpubs.nist.gov/nistpubs/ir/2026/NIST.IR.8547.pdf), Table 1 and §4.1.3, defines post-quantum security Category 1 as "key search on a block cipher with a 128-bit key" (example: AES-128) and states that "all NIST-approved symmetric primitives that provide at least 128 bits of classical security are believed to meet the requirements of at least Category 1 security." It sets no 128-bit post-quantum threshold; earlier wording in this README said it did. The 2⁶⁴ figure for a 128-bit key is Grover's idealized query count, not a practical attack cost, and SM4 and SEED are not NIST-approved primitives, so the comparison to AES-128 rests on key length alone.

**Also reviewed 15 November 2026:** GB/T 32907-2016, as transcribed in [draft-ribose-cfrg-sm4-10 §6.1–6.2](https://datatracker.ietf.org/doc/html/draft-ribose-cfrg-sm4-10), gives the SM4 round as Xᵢ₊₄ = Xᵢ ⊕ T(Xᵢ₊₁ ⊕ Xᵢ₊₂ ⊕ Xᵢ₊₃ ⊕ rkᵢ) with T = L(τ(·)), so the round key is XORed in before the S-boxes and the linear map; earlier wording here and on the page put the key addition after the mix. RFC headers at the RFC Editor: [RFC 6209](https://www.rfc-editor.org/rfc/rfc6209.txt) (ARIA in TLS) is Informational, while [RFC 4162](https://www.rfc-editor.org/rfc/rfc4162.txt) (SEED in TLS) and [RFC 5932](https://www.rfc-editor.org/rfc/rfc5932.txt) (Camellia, obsoleting RFC 4132) are Standards Track — the page's Camellia callout had named ARIA as the second Standards Track cipher, contradicting its own comparison table.

## National standards panel

*As of November 2026, NGCC is in its first round; the ICCS proposal pages list Round 1 candidates only (checked 18 November 2026). Nothing in round one is standardized or deployed.*

The panel after Exhibit 10 makes one point: national standards have usually meant **the same mathematical families with different constructions, parameters and domestic control of the specification**, not different mathematics. It is text only and implements nothing new.

Three rows carry the classical pattern. SM4 beside AES and SM3 beside SHA-256 restate facts this lab and [World Hashes](https://systemslibrarian.github.io/crypto-lab-world-hashes/) already demonstrate. SM2 beside ECDSA on NIST P-256 is text only here; [SM2 Forge](https://systemslibrarian.github.io/crypto-lab-sm2-forge/) implements SM2.

The second half follows the pattern into post-quantum cryptography. NGCC (Next-generation Commercial Cryptographic Algorithms) is an open competition run by China's Institute of Commercial Cryptography Standards (ICCS) on the NIST model.

| Statement in the panel | Source |
|---|---|
| ICCS launched NGCC on 5 February 2025 | [ICCS call for public-key proposals](https://niccs.org.cn/niccs/Notice/pc/content/content_1975896137741635584.html), 9 October 2025, first sentence |
| Formal public-key call on 9 October 2025; deadline 24:00 Beijing time, 30 June 2026 | The same page |
| Hash call also on 9 October 2025; draft block-cipher requirements on 4 September 2026 | Saarinen, *Chinese NGCC Algorithms: The First Week of AI Cryptanalysis* (29 September 2026), §1.1 |
| 119 first-round candidates on 20 September 2026: 34 signature, 41 KEM, 9 key exchange, 35 hash | The same paper, abstract and §1.1 |
| 84 public-key candidates by family: 43 lattice, 21 code, 6 multivariate, 5 isogeny, 4 hash-based signatures, 4 symmetric VOLE-in-the-head, 1 other group action | The same paper, Table 1 |
| NGCC "will not accept the algorithms that are in or have finished the standardization process in international organizations, countries and regions, or related variants with insignificant modifications" | ICCS, *Submission Requirements for Public-Key Cryptographic Algorithms* (October 2025), §1(5), attached to the call |
| The programme is "in response to the threat of quantum computing" and meant to "facilitate the standardization of the next-generation commercial cryptographic algorithms" | ICCS, *Feedback on the Comments Received on the Draft Submission Requirements and Evaluation Criteria* (October 2025), §1, attached to the call |
| Commentary: a push for cryptographic sovereignty; finalists around 2029 | [postquantum.com on the first round](https://postquantum.com/security-pqc/china-ngcc-candidate-flaws/) (23 September 2026) and [on standards fragmentation](https://postquantum.com/post-quantum/pqc-standards-fragmentation-multinationals/). Labelled as commentary on the page; neither is an ICCS statement |

What the panel does not claim: that any NGCC candidate is secure or insecure, that a national standard is weaker or stronger for being national, or that ICCS has announced a schedule beyond round one.

## Real-World Usage
- Camellia-256 is endorsed by CRYPTREC, standardized in TLS cipher suites, and used as an AES alternative in Japan.
- ARIA-256 is mandated for South Korean government and financial-sector systems.
- SM4 is required for products in Chinese markets and is used in Chinese TLS (TLCP) and PKI under Chinese cryptography law.
- Kuznyechik is required for Russian GOST R 34.12-2015 compliance.
- Kalyna is required for Ukrainian state information systems; it replaced GOST 28147-89, the Soviet-era cipher Ukraine had inherited, after an open national competition run 2007–2010.
- BelT is required for Belarusian state information systems and certified cryptographic products, under STB 34.101.31-2020.
- SEED is still permitted in Korean systems and persists in legacy financial software; RFC 4162 added its TLS cipher suites in 2005, seven years after the cipher.
- Camellia, SM4 and SEED are standardized under ISO/IEC 18033-3 (SM4 by Amendment 1:2021); ARIA, Kuznyechik, Kalyna and BelT are not, though all seven serve as sovereign national standards at home.

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
