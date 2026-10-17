import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Skip the intro overlay so tests interact with the page immediately.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('mn:intro', '1');
    localStorage.setItem('mn:visited', '1');
  });
});

const errors = (page: Page) => {
  const list: string[] = [];
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => m.type() === 'error' && list.push(m.text()));
  return list;
};

test('home page renders every section without console errors', async ({ page }) => {
  const errs = errors(page);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Featured T-shirts' })).toBeVisible();
  for (const heading of [/good design/i, /more than what you wear/i, /your idea could fund something bigger/i, /make something that matters/i]) {
    await expect(page.getByRole('heading', { name: heading })).toBeAttached();
  }
  await expect(page.getByText(/sample/i).locator('visible=true').first()).toBeVisible();
  expect(errs).toEqual([]);
});

test('hero carousel responds to keyboard and buttons, and can be paused', async ({ page }) => {
  await page.goto('/');
  const hero = page.getByRole('region', { name: 'Featured T-shirts' });
  const current = () => page.locator('[aria-label^="Show "][aria-current="true"]').getAttribute('aria-label');
  const first = await current();
  await page.getByRole('button', { name: 'Next shirt' }).click();
  await expect.poll(current).not.toBe(first);
  await hero.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(current).toBe(first);
  await page.getByRole('button', { name: 'Pause slideshow' }).click();
  await expect(page.getByRole('button', { name: 'Play slideshow' })).toBeVisible();
});

test('reduced motion disables autoplay', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play slideshow' })).toBeDisabled();
  await ctx.close();
});

test('shopper can filter, choose a variant, add to bag and reach the checkout handoff', async ({ page }) => {
  await page.goto('/shop');
  const firstCard = page.locator('h3 a').first();
  await firstCard.click();
  await expect(page).toHaveURL(/\/shop\/.+/);
  await page.getByRole('button', { name: /add to bag/i }).click();
  await expect(page.getByText('Choose a size')).toBeVisible(); // never guesses a size
  await page.locator('label:has(input[name^="size-"]:not([disabled]))').first().click();
  await page.getByRole('button', { name: /add to bag/i }).click();
  await page.goto('/cart');
  await page.getByRole('button', { name: /secure checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout\/demo/);
  await expect(page.getByText(/no order was placed and nothing was charged/i)).toBeVisible();
});

test('protected areas redirect signed-out visitors to sign in', async ({ page }) => {
  for (const path of ['/creator/dashboard', '/admin/design-reviews', '/admin/payouts']) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/%/g, '%')}`));
  }
});

test('a demo creator sees their dashboard but not the admin centre', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Creator (Ada)' }).click();
  await expect(page).toHaveURL(/\/creator\/dashboard/);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /don.t have access/i })).toBeVisible();
});

// Scan with reduced motion so axe measures settled colours, not text mid-fade.
test.describe('accessibility', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  for (const path of ['/', '/shop', '/shop/made-new-heavyweight', '/campaigns', '/how-it-works', '/login', '/register', '/cart', '/legal/privacy']) {
    test(`no serious accessibility violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
    });
  }
});
