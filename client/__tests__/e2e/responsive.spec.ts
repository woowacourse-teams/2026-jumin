import { expect, test } from '@playwright/test';
import { dismissSurveyIfPresent } from './dismissSurveyIfPresent';

type Bounds = { x: number; y: number; width: number; height: number };

const overlaps = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

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
      await dismissSurveyIfPresent(page);

      const searchButton = page.getByRole('button', { name: '목적지 검색' });
      const locationButton = page.getByRole('button', { name: '현재 위치로 이동' });
      const bottomNav = page.getByRole('navigation', { name: '하단 메뉴' });
      await expect(searchButton).toBeInViewport({ ratio: 1 });
      await expect(locationButton).toBeInViewport({ ratio: 1 });
      await expect(bottomNav).toBeInViewport({ ratio: 1 });

      const search = await searchButton.boundingBox();
      const location = await locationButton.boundingBox();
      const nav = await bottomNav.boundingBox();
      expect(search).not.toBeNull();
      expect(location).not.toBeNull();
      expect(nav).not.toBeNull();
      expect(overlaps(search!, location!)).toBe(false);
      expect(overlaps(search!, nav!)).toBe(false);
      expect(overlaps(location!, nav!)).toBe(false);

      await page.getByRole('link', { name: '최근 이용' }).click();
      await expect(page).toHaveURL(/\/recent$/);
    });

    test(`${width}×${height} 설정 화면을 스크롤해도 피드백 버튼과 하단 메뉴가 겹치지 않는다`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/setting');
      await dismissSurveyIfPresent(page);
      await expect(page.getByRole('heading', { level: 1, name: '설정' })).toBeVisible();

      const nav = page.getByRole('navigation', { name: '하단 메뉴' });
      const feedback = page.getByRole('button', { name: /피드백 보내기/ });
      await feedback.scrollIntoViewIfNeeded();
      await expect(nav).toBeInViewport({ ratio: 1 });
      await expect(feedback).toBeInViewport({ ratio: 1 });

      const feedbackBox = await feedback.boundingBox();
      const navBox = await nav.boundingBox();
      expect(feedbackBox).not.toBeNull();
      expect(navBox).not.toBeNull();
      expect(overlaps(feedbackBox!, navBox!)).toBe(false);

      await page.getByRole('link', { name: '최근 이용', exact: true }).click();
      await expect(page).toHaveURL(/\/recent$/);
    });
  }
});
