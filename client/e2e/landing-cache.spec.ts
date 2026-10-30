import { expect, test } from '@playwright/test';

test('격자 캐시 데모에서 이동·재방문·빈 캐시를 체험한다', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/landing');
  const demo = page.getByRole('region', { name: '격자 캐시 시뮬레이션' });
  const result = demo.getByRole('status');

  await expect(result).toHaveText(
    '캐시에 없는 지역이라 30칸 모두 DB에서 가져와 캐시에 저장했어요.',
  );
  await demo.getByRole('button', { name: '지도를 오른쪽으로 이동', exact: true }).click();
  await expect(result).toHaveText(
    '24칸은 캐시에서 바로 꺼내고, 캐시에 없던 6칸만 DB에서 가져왔어요.',
  );

  await demo.getByRole('button', { name: '처음 위치로', exact: true }).click();
  await expect(result).toHaveText(
    '30칸 모두 캐시 적중. 저장해 둔 주차장 데이터를 그대로 재사용했어요.',
  );
  await demo.getByRole('button', { name: '캐시 비우기', exact: true }).click();
  await expect(result).toHaveText(
    '캐시가 비었어요. 현재 화면의 30칸 모두 DB에서 다시 가져와 캐시에 저장했어요.',
  );

  const left = demo.getByRole('button', { name: '지도를 왼쪽으로 이동', exact: true });
  await left.click();
  await expect(left).toBeDisabled();
  await demo.getByRole('button', { name: '지도를 위쪽으로 이동', exact: true }).click();
  await expect(
    demo.getByRole('button', { name: '지도를 위쪽으로 이동', exact: true }),
  ).toBeDisabled();
  const right = demo.getByRole('button', { name: '지도를 오른쪽으로 이동', exact: true });
  for (let step = 0; step < 5; step += 1) await right.click();
  await expect(right).toBeDisabled();
  const down = demo.getByRole('button', { name: '지도를 아래쪽으로 이동', exact: true });
  for (let step = 0; step < 3; step += 1) await down.click();
  await expect(down).toBeDisabled();
  expect(apiRequests).toEqual([]);
});
