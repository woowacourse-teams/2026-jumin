import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('jucha-guide-seen-v2', 'true');
  });
});

test.describe('모바일 화면', () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const { width, height } of [
    { width: 320, height: 568 },
    { width: 402, height: 874 },
    { width: 432, height: 932 },
  ]) {
    test(`${width}×${height} 화면에서 검색창·버튼·메뉴가 겹치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');

      const root = await page.locator('#root').boundingBox();
      const search = await page
        .getByRole('textbox', { name: '목적지 검색' })
        .locator('..')
        .boundingBox();
      const help = await page.getByRole('button', { name: '도움말 메뉴 열기' }).boundingBox();
      const location = await page.getByRole('button', { name: '현재 위치로 이동' }).boundingBox();
      const nav = await page.getByRole('navigation', { name: '하단 메뉴' }).boundingBox();

      expect(root?.height).toBe(height);
      expect(search).not.toBeNull();
      expect(help).not.toBeNull();
      expect(location).not.toBeNull();
      expect(nav).not.toBeNull();
      expect(search!.x).toBeGreaterThanOrEqual(16);
      expect(search!.x + search!.width).toBeLessThanOrEqual(width - 16);
      expect(help!.y + help!.height).toBeLessThan(location!.y);
      expect(location!.y + location!.height).toBeLessThan(nav!.y);

      await page.getByRole('button', { name: '도움말 메뉴 열기' }).click();
      const menu = await page.getByRole('group', { name: '도움말 메뉴' }).boundingBox();

      expect(menu).not.toBeNull();
      expect(menu!.x).toBeGreaterThanOrEqual(0);
      expect(menu!.y).toBeGreaterThanOrEqual(0);
      expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
      expect(menu!.y + menu!.height).toBeLessThan(help!.y);

      await page.getByRole('button', { name: '도움말 메뉴 닫기' }).click();
      await page.getByRole('link', { name: '최근 이용' }).click();
      await expect(page).toHaveURL(/\/recent$/);
    });

    test(`${width}×${height} 설정 화면에서 메뉴를 스크롤해도 하단 메뉴가 유지된다`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/setting');
      await expect(page.getByRole('heading', { level: 1, name: '설정' })).toBeVisible();

      const nav = page.getByRole('navigation', { name: '하단 메뉴' });
      const navBefore = await nav.boundingBox();
      const feedback = page.getByRole('button', { name: /피드백 보내기/ });
      await feedback.scrollIntoViewIfNeeded();

      const feedbackBox = await feedback.boundingBox();
      const navAfter = await nav.boundingBox();
      expect(feedbackBox).not.toBeNull();
      expect(navBefore).toEqual(navAfter);
      expect(feedbackBox!.y + feedbackBox!.height).toBeLessThanOrEqual(navAfter!.y);
      expect(feedbackBox!.x).toBeGreaterThanOrEqual(0);
      expect(feedbackBox!.x + feedbackBox!.width).toBeLessThanOrEqual(width);
      expect(await page.locator('main').evaluate((element) => element.scrollWidth)).toBe(width);

      await page.getByRole('link', { name: '최근 이용', exact: true }).click();
      await expect(page).toHaveURL(/\/recent$/);
    });
  }
});
