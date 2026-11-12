import type { Page } from '@playwright/test';

export const dismissSurveyIfPresent = async (page: Page) => {
  // 설문 노출은 검증 대상이 아니므로 새 지도 레이아웃이 뜬 뒤 보일 때만 닫는다.
  await page.locator('[role="region"][aria-label="지도"]').waitFor({ state: 'attached' });
  const close = page.getByRole('button', { name: '서비스 이용 경험 설문 닫기' });
  if (await close.isVisible()) await close.click();
};
