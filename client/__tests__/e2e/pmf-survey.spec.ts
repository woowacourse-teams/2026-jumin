import { expect, test } from '@playwright/test';

test('오버레이·Escape·닫기로 닫은 설문은 다시 보이고, 3일간 보지 않기는 유지된다', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const survey = page.getByRole('dialog', { name: '서비스 이용 경험 설문' });
  await expect(survey).toBeVisible();

  await page.mouse.click(5, 5);
  await expect(survey).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(survey).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(survey).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(survey).toBeVisible();

  await page.getByRole('button', { name: '서비스 이용 경험 설문 닫기' }).click();
  await expect(survey).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(survey).toBeVisible();

  await page.getByRole('button', { name: '3일간 보지 않기' }).click();
  await expect(survey).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(survey).toHaveCount(0);
});
