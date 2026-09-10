import { expect, test } from '@playwright/test';

test('애플리케이션에 접속할 수 있다', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '어디로 가세요?' })).toBeVisible();
});
