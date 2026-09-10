import { expect, test } from '@playwright/test';

test.describe('대형 터치 화면', () => {
  test.use({ viewport: { width: 432, height: 932 }, hasTouch: true, isMobile: true });

  test('휴대폰 화면 전체를 채운다', async ({ page }) => {
    await page.goto('/');

    const rootHeight = await page
      .locator('#root')
      .evaluate((root) => root.getBoundingClientRect().height);

    expect(rootHeight).toBe(932);
  });
});
