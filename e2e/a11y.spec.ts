import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG regression gate. Deploys are already gated on the NIST/GOST KAT
 * vectors; this gates them on accessibility the same way. Scans the full
 * page with every disclosure expanded and every live demo driven, in both
 * themes.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function killMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}`,
  });
}

async function openAllDetails(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const details of document.querySelectorAll('details')) {
      details.open = true;
    }
    for (const el of document.querySelectorAll<HTMLElement>('[hidden]')) {
      el.hidden = false;
    }
  });
}

/** Click every demo button so aria-live output areas are populated when scanned. */
async function driveDemos(page: Page): Promise<void> {
  const ids = [
    'kat-run',
    'cam-encrypt',
    'cam-decrypt',
    'cam-compare',
    'aria-encrypt',
    'aria-decrypt',
    'aria-sbox-go',
    'aria-diff-go',
    'sm4-encrypt',
    'sm4-decrypt',
    'kuz-encrypt',
    'kuz-decrypt',
    'av-run',
    'av-random',
    'mode-run',
  ];
  for (const id of ids) {
    const btn = page.locator(`#${id}`);
    if (await btn.count()) {
      await btn.first().click().catch(() => {});
    }
  }
  await page.waitForTimeout(200);
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

async function prep(page: Page): Promise<void> {
  await page.goto('.');
  await killMotion(page);
  await openAllDetails(page);
  await driveDemos(page);
  await openAllDetails(page);
}

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await prep(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await scan(page);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await prep(page);
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await scan(page);
});
