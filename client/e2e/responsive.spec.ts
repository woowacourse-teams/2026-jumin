import { expect, test } from '@playwright/test';

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
  }
});
