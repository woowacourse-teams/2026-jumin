import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('jucha-guide-seen-v2', 'true');
  });
});

test('애플리케이션에 접속할 수 있다', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('textbox', { name: '목적지 검색' })).toBeVisible();
});
