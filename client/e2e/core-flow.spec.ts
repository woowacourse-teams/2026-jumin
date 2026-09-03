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

type CapturedRequestWindow = Window & {
  __capturedApiRequests?: string[];
};

const captureApiRequests = async (page: Page) => {
  await page.evaluate(() => {
    const testWindow = window as CapturedRequestWindow;
    const originalFetch = window.fetch.bind(window);

    testWindow.__capturedApiRequests = [];
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      testWindow.__capturedApiRequests?.push(new URL(url, window.location.origin).toString());

      return originalFetch(input, init);
    };
  });
};

const getCapturedParkingSearchRequest = async (page: Page) => {
  const requestUrl = await page.evaluate(() =>
    (window as CapturedRequestWindow).__capturedApiRequests?.find((url) =>
      new URL(url).pathname.startsWith('/api/parking/search'),
    ),
  );

  expect(requestUrl).toBeDefined();

  return new URL(requestUrl!);
};

const goToParkingTimeStep = async (page: Page) => {
  await page.getByRole('button', { name: '다음' }).click();
  await expect(page.getByRole('heading', { name: '언제 주차하세요?' })).toBeVisible();
};

const requestRecommendation = async (page: Page) => {
  await page.getByRole('button', { name: '+1시간' }).click();
  await page.getByRole('button', { name: '추천 받기' }).click();
  await expect(page.getByRole('region', { name: '거리순 추천 주차장' })).toBeVisible();
};

const searchDestination = async (page: Page) => {
  await page.getByRole('button', { name: '목적지 검색하기' }).click();
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
  await goToParkingTimeStep(page);
  await requestRecommendation(page);

  const recommendation = page.getByRole('region', { name: '거리순 추천 주차장' });
  const parkingLotCard = recommendation
    .getByRole('heading', { name: PARKING_LOT.name })
    .locator('..');

  await parkingLotCard.getByRole('button', { name: '상세정보' }).click();
  await expect(page).toHaveURL(/\/parkingDetail$/);
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

  await expect(page.getByText('6,000원')).toBeVisible();
  await expect(page.getByText('직선거리 310m')).toBeVisible();
  await expect(page.getByText('평일 24시간')).toBeVisible();
});

test('2. 현재 위치 주변의 주차장을 추천받는다', async ({ page }) => {
  await page.goto('/');
  await captureApiRequests(page);

  await page.getByRole('button', { name: '내 주변 주차장' }).click();
  await expect(page.getByRole('region', { name: '선택한 목적지' })).toContainText('현재 위치');

  await goToParkingTimeStep(page);
  await requestRecommendation(page);

  await expect(page.getByRole('heading', { name: PARKING_LOT.name }).first()).toBeVisible();

  const requestUrl = await getCapturedParkingSearchRequest(page);
  expect(requestUrl.searchParams.get('destinationLatitude')).toBe(
    String(CURRENT_LOCATION.latitude),
  );
  expect(requestUrl.searchParams.get('destinationLongitude')).toBe(
    String(CURRENT_LOCATION.longitude),
  );
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
