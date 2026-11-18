import { expect, test } from '@playwright/test';

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

    // Commentary is labelled as commentary, and no link goes to ePrint.
    expect(text).toContain('Those two points are commentary, not ICCS statements.');
    const hrefs = await panel.locator('a[href^="http"]').evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
    expect(hrefs).toContain('https://niccs.org.cn/niccs/Notice/pc/content/content_1975896137741635584.html');
    // Compared as parsed hostnames, not substrings: a substring test also matches
    // a host that merely contains the name.
    expect(hrefs.map((href) => new URL(href).hostname)).not.toContain('eprint.iacr.org');

    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
