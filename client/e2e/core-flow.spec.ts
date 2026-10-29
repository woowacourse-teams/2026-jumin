import { expect, test, type Page } from '@playwright/test';

const CURRENT_LOCATION = {
  latitude: 37.4981,
  longitude: 127.0279,
};

const PARKING_LOT = {
  id: 101,
  name: '역삼문화공원 제1호 공영주차장',
  address: '서울 강남구 테헤란로7길 21',
  location: {
    latitude: 37.499,
    longitude: 127.029,
  },
};

const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';

const requestRecommendation = async (page: Page) => {
  await page.getByRole('button', { name: '다음' }).click();
  await expect(page.getByRole('region', { name: '주차장 전체 목록' })).toBeVisible();
};

const searchDestination = async (page: Page) => {
  await page.getByRole('textbox', { name: '목적지 검색' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/search');
  await expect(page.getByRole('heading', { name: '최근 검색' })).toBeVisible();
  await page.getByRole('textbox', { name: '목적지 검색' }).fill('강남역');
  await page
    .getByRole('button', { name: /강남역 11번 출구/ })
    .first()
    .click();

  await expect(page.getByRole('region', { name: '선택한 목적지' })).toContainText(
    '강남역 11번 출구',
  );
};

const goToRecommendedParkingDetail = async (page: Page) => {
  await page.goto('/');
  await searchDestination(page);
  await requestRecommendation(page);

  const recommendation = page.getByRole('region', { name: '주차장 전체 목록' });
  await recommendation.getByRole('button', { name: `${PARKING_LOT.name} 상세정보` }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/parkingRecommend');
  await expect(page.getByRole('heading', { level: 1, name: PARKING_LOT.name })).toBeVisible();
};

const watchAndroidDeepLink = async (page: Page) => {
  const session = await page.context().newCDPSession(page);
  await session.send('Page.enable');

  const requested = new Promise<string>((resolve) => {
    session.on('Page.frameRequestedNavigation', (event: { url: string }) => {
      if (event.url.startsWith('intent://')) resolve(event.url);
    });
  });

  return { requested };
};

const getIntentSearchParams = (intentUrl: string) => {
  const routeUrl = intentUrl.split('#Intent')[0]!.replace('intent://', 'https://');

  return new URL(routeUrl).searchParams;
};

test('1. 추천 주차장의 상세정보를 확인한다', async ({ page }) => {
  await goToRecommendedParkingDetail(page);

  const detail = page.getByRole('region', { name: '주차장 상세정보', exact: true });
  await expect(detail.getByText('6,000원')).toBeVisible();
  await expect(detail.getByText('310m(5분)')).toBeVisible();
  await expect(detail.getByText('평일 24시간')).toBeVisible();
});

test('추천 URL을 새 탭에서 열거나 새로고침해도 목적지와 조회 조건을 유지한다', async ({ page }) => {
  await page.goto('/');
  await searchDestination(page);
  await requestRecommendation(page);
  const recommendationUrl = page.url();
  const params = new URL(recommendationUrl).searchParams;
  for (const key of ['lat', 'lng', 'name', 'entryAt', 'exitAt']) {
    expect(params.get(key)).toBeTruthy();
  }

  const sharedPage = await page.context().newPage();
  await sharedPage.goto(recommendationUrl);
  await expect(sharedPage.getByRole('region', { name: '주차장 전체 목록' })).toBeVisible();
  await expect(
    sharedPage.getByRole('heading', { level: 1, name: params.get('name')! }),
  ).toBeVisible();
  await sharedPage.reload();
  await expect(sharedPage.getByRole('region', { name: '주차장 전체 목록' })).toBeVisible();
  await expect(sharedPage).toHaveURL(recommendationUrl);
  await sharedPage.close();
});

test('추천·더보기 주차장 상세를 같은 화면에서 열고 선택과 정렬을 유지한다', async ({ page }) => {
  await page.goto('/');
  await searchDestination(page);
  await requestRecommendation(page);
  const region = page.getByRole('region', { name: '주차장 전체 목록' });
  await expect(region.getByRole('tab')).toHaveText(['추천순', '거리순', '가격순']);

  for (const name of ['강남대로 공영주차장', '목록 확인 주차장 3']) {
    const select = region.getByRole('button', { name: `${name} 선택` });
    await select.click();
    await expect(select).toHaveAttribute('aria-pressed', 'true');
    await region.getByRole('button', { name: `${name} 상세정보` }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/parkingRecommend');
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('button', { name: '길찾기 시작' })).toBeVisible();
    await expect(region).toBeHidden();
    await page.getByRole('button', { name: '이전 화면으로 이동' }).click();
    await expect(select).toBeVisible();
    await expect(select).toHaveAttribute('aria-pressed', 'true');
    await expect(region.getByRole('tab', { name: '추천순' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  }
  await region.getByRole('tab', { name: '가격순' }).click();
  await region.getByRole('button', { name: `${PARKING_LOT.name} 상세정보` }).click();
  await expect(page.getByRole('button', { name: '길찾기 시작' })).toBeVisible();
  await page.getByRole('button', { name: '이전 화면으로 이동' }).click();
  await expect(region.getByRole('tab', { name: '가격순' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('2. 설정에서 가이드와 기존 랜딩페이지를 확인한다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '주변', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '설정', exact: true }).click();
  await expect(page).toHaveURL(/\/setting$/);
  await expect(page.getByRole('link', { name: '설정', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('button', { name: /앱 설치/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /피드백 보내기/ })).toBeVisible();

  await page.getByRole('button', { name: /가이드 보기/ }).click();
  await expect(page.getByRole('dialog', { name: '주차의민족 이용 가이드' })).toBeVisible();
  await page.getByRole('button', { name: '건너뛰기' }).click();

  await page.getByRole('link', { name: /주차의민족 소개/ }).click();
  await expect(page).toHaveURL(/\/landing$/);
  await expect(page.getByRole('heading', { level: 1, name: /목적지를 입력하면/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/setting$/);
});

test.describe('길찾기', () => {
  test.use({ userAgent: ANDROID_USER_AGENT });

  test('3. 최근 이용한 주차장의 길찾기를 요청한다', async ({ page }) => {
    await page.addInitScript(
      (recentParkingUse) => {
        localStorage.setItem('recentParkingUses', JSON.stringify([recentParkingUse]));
      },
      {
        parkingLot: PARKING_LOT,
        usedAt: '2026-09-01T12:00:00.000Z',
      },
    );

    await page.goto('/recent');
    await page.getByRole('button', { name: new RegExp(PARKING_LOT.name) }).click();

    const dialog = page.getByRole('dialog', { name: '길찾기 앱 선택' });
    await expect(dialog).toBeVisible();

    const naverMapButton = dialog.getByRole('button', { name: /네이버 지도/ });
    await expect(naverMapButton).toBeEnabled();

    const { requested: deepLinkRequested } = await watchAndroidDeepLink(page);
    await naverMapButton.click();

    const searchParams = getIntentSearchParams(await deepLinkRequested);
    expect(searchParams.get('dname')).toBe(PARKING_LOT.name);
    expect(searchParams.get('dlat')).toBe(String(PARKING_LOT.location.latitude));
    expect(searchParams.get('dlng')).toBe(String(PARKING_LOT.location.longitude));
  });

  test('4. 상세정보를 확인한 주차장의 길찾기를 요청한다', async ({ page }) => {
    await goToRecommendedParkingDetail(page);
    expect(await page.evaluate(() => localStorage.getItem('recentParkingUses'))).toBeNull();

    await page.getByRole('button', { name: '길찾기 시작' }).click();
    const dialog = page.getByRole('dialog', { name: '길찾기 앱 선택' });
    await expect(dialog).toBeVisible();

    const naverMapButton = dialog.getByRole('button', { name: /네이버 지도/ });
    await expect(naverMapButton).toBeEnabled();

    const { requested: deepLinkRequested } = await watchAndroidDeepLink(page);
    await naverMapButton.click();

    const searchParams = getIntentSearchParams(await deepLinkRequested);
    expect(searchParams.get('slat')).toBe(String(CURRENT_LOCATION.latitude));
    expect(searchParams.get('slng')).toBe(String(CURRENT_LOCATION.longitude));
    expect(searchParams.get('dlat')).toBe(String(PARKING_LOT.location.latitude));
    expect(searchParams.get('dlng')).toBe(String(PARKING_LOT.location.longitude));

    const recentParkingUses = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('recentParkingUses') ?? '[]'),
    );
    expect(recentParkingUses).toEqual([
      expect.objectContaining({
        parkingLot: expect.objectContaining({
          id: PARKING_LOT.id,
          name: PARKING_LOT.name,
        }),
      }),
    ]);
  });
});
