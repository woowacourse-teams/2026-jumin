import { expect, test } from '@playwright/test';
import { dismissSurveyIfPresent } from './dismissSurveyIfPresent';

test('애플리케이션에 접속할 수 있다 @smoke', async ({ page }) => {
  await page.goto('/');
  await dismissSurveyIfPresent(page);

  // 홈에서는 편집할 수 없는 검색 입력 대신 검색 화면 진입 버튼을 제공한다.
  await expect(page.getByRole('button', { name: '목적지 검색' })).toBeVisible();
});
