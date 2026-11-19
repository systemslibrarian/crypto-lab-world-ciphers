import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The national-standards panel is text only, so there is nothing to recompute.
 * What can be checked is that it is on the page, that its own arithmetic adds
 * up, that it agrees with what the exhibits above it say about the same
 * ciphers, and that it does not push the page sideways at phone width.
 */

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

for (const width of [1280, 380]) {
  test(`national-standards panel is present and self-consistent at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('.');

    const panel = page.locator('#national-standards');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 2 })).toContainText('National Standards');

    // The nav reaches it.
    await page.locator('.exhibit-nav a[href="#national-standards"]').click();
    await expect(panel).toBeInViewport();

    // A dated status line.
    const status = squash(await page.locator('#standards-status').innerText());
    expect(status).toContain('As of November 2026, NGCC is in its first round');
    expect(status).toContain('Nothing in round one is standardized or deployed');

    // One row each for block cipher, hash and signature; the signature row is text only.
    const rows = await panel.locator('tbody tr th[scope="row"]').allInnerTexts();
    expect(rows.map(squash)).toEqual(['Block cipher', 'Hash', 'Signature']);
    await expect(panel.locator('tbody tr').nth(2)).toContainText('Neither is implemented in this lab');

    // The SM4 row must not contradict Exhibit 3, which states the same facts
    // from GB/T 32907-2016. Both sides are read off the page.
    const exhibit = squash(await page.locator('#exhibit-3 .origin').innerText());
    const sm4Row = squash(await panel.locator('tbody tr').nth(0).innerText());
    expect(exhibit).toContain('GB/T 32907-2016');
    expect(sm4Row).toContain('GB/T 32907-2016');
    expect(exhibit).toMatch(/32-round non-balanced Feistel network/);
    expect(sm4Row).toMatch(/32-round non-balanced Feistel network/);
    expect(exhibit).toMatch(/128-bit only/);
    expect(sm4Row).toMatch(/128-bit key only/);

    // The counts the panel prints add up to the totals it prints.
    const text = squash(await panel.innerText());
    const candidates = /119 first-round candidates are published: (\d+) signature schemes, (\d+) key-encapsulation mechanisms, (\d+) key-exchange schemes and (\d+) hash functions/.exec(text);
    expect(candidates, 'the candidate breakdown is on the page').not.toBeNull();
    const [sign, kem, kex, hash] = candidates!.slice(1).map(Number);
    expect(sign + kem + kex + hash).toBe(119);
    const families = /The (\d+) public-key candidates come from the families other post-quantum efforts use: (\d+) lattice-based, (\d+) code-based, (\d+) multivariate, (\d+) isogeny-based, (\d+) hash-based signatures, (\d+) symmetric \(VOLE-in-the-head\) and (\d+) other group action/.exec(text);
    expect(families, 'the family breakdown is on the page').not.toBeNull();
    const [publicKey, ...byFamily] = families!.slice(1).map(Number);
    expect(publicKey).toBe(sign + kem + kex);
    expect(byFamily.reduce((a, b) => a + b, 0)).toBe(publicKey);

    // Commentary is labelled as commentary, and each claim sits with the article
    // that makes it: the sovereignty reading and "2029 at the earliest for
    // standards" are the first-round article's; "finalists around 2029" is the
    // fragmentation article's.
    expect(text).toContain('Both are commentary, not ICCS statements.');
    expect(text).toMatch(/article on the first round \(23 September 2026\) describes NGCC as part of a "broader push for cryptographic sovereignty", and its author treats 2029 as the earliest plausible date for NGCC standards/);
    expect(text).toMatch(/An earlier article on the same site \(April 2026\) says the process targets finalists around 2029/);

    const hrefs = await panel.locator('a[href^="http"]').evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
    // Both ICCS calls are cited from ICCS, and the survey paper is linked.
    expect(hrefs).toContain('https://niccs.org.cn/niccs/Notice/pc/content/content_1975896137741635584.html');
    expect(hrefs).toContain('https://www.niccs.org.cn/niccs/Notice/pc/content/content_1975892908773478400.html');
    expect(hrefs).toContain('https://eprint.iacr.org/2026/2266');
    // No outside link that supports nothing on the page. Compared as parsed
    // hostnames, not substrings: a substring test also matches a host that merely
    // contains the name.
    const hosts = [...new Set(hrefs.map((href) => new URL(href).hostname))].sort();
    expect(hosts).toEqual(['eprint.iacr.org', 'niccs.org.cn', 'postquantum.com', 'systemslibrarian.github.io', 'www.niccs.org.cn']);
    // The README's source table and the panel cite the same outside pages.
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    for (const href of hrefs.filter((h) => new URL(h).hostname !== 'systemslibrarian.github.io')) {
      expect(readme, `README lists ${href}`).toContain(`(${href})`);
    }
    const readmeCommentary = [...readme.matchAll(/\((https:\/\/[^)\s]+)\)/g)]
      .map((m) => m[1])
      .filter((url) => !['niccs.org.cn', 'www.niccs.org.cn', 'eprint.iacr.org', 'systemslibrarian.github.io', 'github.com'].includes(new URL(url).hostname))
      .filter((url) => readme.indexOf(`(${url})`) > readme.indexOf('| Statement in the panel | Source |'))
      .filter((url) => readme.indexOf(`(${url})`) < readme.indexOf('What the panel does not claim'));
    for (const url of readmeCommentary) expect(hrefs, `the panel links ${url}`).toContain(url);

    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
