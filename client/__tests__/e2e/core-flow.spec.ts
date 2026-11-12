import { expect, test, type Page } from '@playwright/test';
import { dismissSurveyIfPresent } from './dismissSurveyIfPresent';

// @태그는 CI에서 변경된 사용자 흐름의 E2E 테스트를 선택할 때 사용한다.
const CURRENT_LOCATION = {
  latitude: 37.4981,
  longitude: 127.0279,
};

// 목 추천 응답은 홈 지도와 같은 실제 주차장 데이터를 쓴다. 강남역 11번 출구에서 가장 가까운 주차장이다.
const PARKING_LOT = {
  id: 201,
  name: '시계탑빌딩 주차장',
  address: '강남구 강남대로 402',
  location: {
    latitude: 37.498784,
    longitude: 127.027824,
  },
};

const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';

// 길찾기 E2E는 위치 공급자 대신 모달 조작과 딥링크를 검증한다.
// CI Chrome에서 위치 조회가 10초 뒤 TIMEOUT을 반환하므로 현재 위치 입력을 고정한다.
const mockCurrentLocation = async (page: Page) => {
  await page.addInitScript(({ latitude, longitude }) => {
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      configurable: true,
      value: (success: PositionCallback) => {
        // 앱이 예약한 LOADING 갱신 뒤에 READY가 적용되도록 브라우저처럼 비동기로 응답한다.
        queueMicrotask(() =>
          success({
            coords: {
              latitude,
              longitude,
              accuracy: 1,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition),
        );
      },
    });
  }, CURRENT_LOCATION);
};

const requestRecommendation = async (page: Page) => {
  await page.getByRole('button', { name: '다음' }).click();
  await expect(page.getByRole('region', { name: '주차장 전체 목록' })).toBeVisible();
};

const searchDestination = async (page: Page) => {
  // 홈의 검색 진입 버튼과 검색 화면의 실제 입력을 구분한다.
  await page.getByRole('button', { name: '목적지 검색' }).click();
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

test('연관 주차장 3개를 먼저 보여주고 선택하면 상세를 연다 @search @parking-detail', async ({
  page,
}) => {
  await page.goto('/');
  await dismissSurveyIfPresent(page);
  await page.getByRole('button', { name: '목적지 검색' }).click();
  await page.getByRole('textbox', { name: '목적지 검색' }).fill('강남');

  const results = page.getByRole('region', { name: '목적지 검색 결과' });
  const parkingLots = results.getByRole('list', { name: '연관 주차장' });
  await expect(parkingLots.getByRole('button')).toHaveCount(3);
  await expect(results.getByRole('list').nth(1).getByRole('button').first()).toBeVisible();

  const firstParking = parkingLots.getByRole('button').first();
  const parkingName = (await firstParking.innerText()).split('\n')[0]!;
  await firstParking.click();

  await expect(page).toHaveURL(
    (url) => url.pathname === '/' && url.searchParams.has('parkingLotId'),
  );
  await expect(page.getByRole('heading', { level: 1, name: parkingName })).toBeVisible();
  await expect(page.getByRole('region', { name: '요금 정보' })).toBeVisible();

  await page.goBack();
  await page.getByRole('textbox', { name: '목적지 검색' }).fill('시계탑');
  await expect(page.getByRole('list', { name: '연관 주차장' })).toContainText('시계탑빌딩 주차장');
  await page.getByRole('textbox', { name: '목적지 검색' }).press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: '시계탑빌딩 주차장' })).toBeVisible();
});

const goToRecommendedParkingDetail = async (page: Page) => {
  await page.goto('/');
  await dismissSurveyIfPresent(page);
  await searchDestination(page);
  await requestRecommendation(page);

  const recommendation = page.getByRole('region', { name: '주차장 전체 목록' });
  // 추천순은 조회 시각의 운영 여부에 따라 바뀌므로, 항상 1위인 거리순에서 추천 카드를 연다.
  await recommendation.getByRole('radio', { name: '거리순' }).click();
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

test('서비스 페이지를 왕복한 뒤 지도와 검색 흐름을 사용할 수 있다 @navigation @search @setup @recommend', async ({
  page,
}) => {
  await page.goto('/');
  await dismissSurveyIfPresent(page);
  const map = page.getByRole('region', { name: '지도', exact: true });
  await expect(map).toBeVisible();

  await page.getByRole('link', { name: '설정', exact: true }).click();
  await expect(page.getByRole('heading', { name: '설정', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: '최근 이용', exact: true }).click();
  await expect(page.getByRole('heading', { name: '최근 이용', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: '홈', exact: true }).click();
  await expect(map).toBeVisible();
  await searchDestination(page);
  await expect(map).toBeVisible();

  await requestRecommendation(page);
  await expect(map).toBeVisible();
});

test('1. 추천 주차장의 상세정보를 확인한다 @recommend @parking-detail', async ({ page }) => {
  await goToRecommendedParkingDetail(page);

  const detail = page.getByRole('region', { name: '주차장 상세정보', exact: true });
  const feeRow = detail.getByText(/예상 요금/).locator('..');
  await expect(feeRow.getByText(/^(?:[\d,]+원|미제공)$/)).toBeVisible();
  await expect(detail.getByText('도보 거리').locator('..').getByRole('definition')).toHaveText(
    /\S/,
  );
  await expect(detail.getByText('운영시간').locator('..').getByRole('definition')).toHaveText(/\S/);
});

test('추천 URL을 새 탭에서 열거나 새로고침해도 목적지와 조회 조건을 유지한다 @setup @recommend @navigation', async ({
  page,
}) => {
  await page.goto('/');
  await dismissSurveyIfPresent(page);
  await searchDestination(page);
  await requestRecommendation(page);
  const recommendationUrl = page.url();
  const params = new URL(recommendationUrl).searchParams;
  for (const key of ['lat', 'lng', 'name', 'entryAt', 'exitAt']) {
    expect(params.get(key)).toBeTruthy();
  }

  const sharedPage = await page.context().newPage();
  await sharedPage.goto(recommendationUrl);
  await dismissSurveyIfPresent(sharedPage);
  await expect(sharedPage.getByRole('region', { name: '주차장 전체 목록' })).toBeVisible();
  await expect(
    sharedPage.getByRole('heading', { level: 1, name: params.get('name')! }),
  ).toBeVisible();
  await sharedPage.reload();
  await dismissSurveyIfPresent(sharedPage);
  await expect(sharedPage.getByRole('region', { name: '주차장 전체 목록' })).toBeVisible();
  await expect(sharedPage).toHaveURL(recommendationUrl);
  await sharedPage.close();
});

test('추천·더보기 주차장 상세를 같은 화면에서 열고 선택과 정렬을 유지한다 @recommend @parking-detail', async ({
  page,
}) => {
  await page.goto('/');
  await dismissSurveyIfPresent(page);
  await searchDestination(page);
  await requestRecommendation(page);
  const region = page.getByRole('region', { name: '주차장 전체 목록' });
  // 동일 목록의 정렬 기준은 네이티브 라디오 입력으로 제공한다.
  for (const name of ['추천순', '거리순', '가격순']) {
    await expect(region.getByRole('radio', { name })).toBeVisible();
  }

  // 조회 시각에 따라 순위가 달라져도 두 섹션에서 각각 한 곳을 열어 확인한다.
  for (const sectionName of [/^추천 주차장 \d+곳$/, /^더보기 주차장 \d+곳$/]) {
    const item = region.getByRole('listitem').filter({
      has: page.getByRole('heading', { name: sectionName }),
    });
    const select = item.getByRole('button', { name: / 선택$/ });
    const detail = item.getByRole('button', { name: / 상세정보$/ });
    const name = (await select.getAttribute('aria-label'))!.replace(/ 선택$/, '');
    await select.click();
    await expect(select).toHaveAttribute('aria-pressed', 'true');
    await detail.click();
    await expect(page).toHaveURL((url) => url.pathname === '/parkingRecommend');
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('button', { name: '길찾기 시작' })).toBeVisible();
    await expect(region).toBeHidden();
    await page.getByRole('button', { name: '이전 화면으로 이동' }).click();
    await expect(select).toBeVisible();
    await expect(select).toHaveAttribute('aria-pressed', 'true');
    await expect(region.getByRole('radio', { name: '추천순' })).toBeChecked();
  }
  await region.getByRole('radio', { name: '가격순' }).click();
  await region.getByRole('button', { name: `${PARKING_LOT.name} 상세정보` }).click();
  await expect(page.getByRole('button', { name: '길찾기 시작' })).toBeVisible();
  await page.getByRole('button', { name: '이전 화면으로 이동' }).click();
  await expect(region.getByRole('radio', { name: '가격순' })).toBeChecked();
});

test('2. 설정에서 가이드와 랜딩페이지를 확인하고 주차장 찾기를 시작한다 @setting @navigation', async ({
  page,
}) => {
  await page.goto('/');
  await dismissSurveyIfPresent(page);
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
  const guide = page.getByRole('dialog', { name: '주차의민족 이용 가이드' });
  await expect(guide).toBeVisible();
  // 다음 단계로 이동하면 번호뿐 아니라 새 설명도 같은 안내 영역에 반영한다.
  await guide.getByRole('button', { name: '다음', exact: true }).click();
  await expect(guide.getByRole('status')).toContainText('총 3단계 중 2단계.');
  await expect(guide.getByRole('status')).toContainText(
    await guide.getByRole('heading', { level: 2 }).innerText(),
  );
  await page.getByRole('button', { name: '건너뛰기' }).click();

  await page.getByRole('link', { name: /주차의민족 소개/ }).click();
  await expect(page).toHaveURL(/\/landing$/);
  await expect(page.getByRole('heading', { level: 1, name: /목적지는 정했는데/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/setting$/);
  await dismissSurveyIfPresent(page);

  await page.getByRole('link', { name: /주차의민족 소개/ }).click();
  await page
    .getByRole('navigation', { name: '랜딩페이지 메뉴' })
    .getByRole('link', { name: '기술 이야기', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: /보이지 않는 기술/ })).toBeInViewport();
  await page.getByRole('link', { name: '주차장 찾아보기', exact: true }).last().click();
  await expect(page).toHaveURL('/');
  await dismissSurveyIfPresent(page);
  await expect(page.getByRole('button', { name: '목적지 검색' })).toBeVisible();
});

test('키보드로 검색·정렬·상세·길찾기 모달을 조작하고 포커스를 복원한다 @search @recommend @parking-detail @directions @a11y', async ({
  page,
}) => {
  await mockCurrentLocation(page);
  await page.goto('/');
  await dismissSurveyIfPresent(page);

  // 진입 버튼의 Enter 동작과 검색 화면의 자동 포커스를 실제 브라우저에서 확인한다.
  await page.getByRole('button', { name: '목적지 검색' }).focus();
  await page.keyboard.press('Enter');
  const input = page.getByRole('textbox', { name: '목적지 검색' });
  await expect(input).toBeFocused();
  await input.fill('강남역');
  await expect(
    page.getByRole('region', { name: '목적지 검색 결과' }).getByRole('status'),
  ).toHaveText(/검색 결과 \d+곳/);
  const firstDestinationName = (
    await page
      .getByRole('region', { name: '목적지 검색 결과' })
      .getByRole('list')
      .last()
      .getByRole('button')
      .first()
      .innerText()
  ).split('\n')[0]!;
  await input.press('Enter');
  await expect(page.getByRole('region', { name: '선택한 목적지' })).toContainText(
    firstDestinationName,
  );
  await requestRecommendation(page);

  const region = page.getByRole('region', { name: '주차장 전체 목록' });
  await region.getByRole('radio', { name: '추천순' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(region.getByRole('radio', { name: '가격순' })).toBeChecked();

  // 상세 목록을 숨겼을 때 포커스가 함께 사라지지 않아야 한다.
  const detailButton = region.getByRole('button', { name: `${PARKING_LOT.name} 상세정보` });
  await detailButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: PARKING_LOT.name })).toBeFocused();

  const directions = page.getByRole('button', { name: '길찾기 시작' });
  await directions.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '어떤 앱으로 갈까요?' });
  await expect(dialog).toHaveAccessibleDescription(`${PARKING_LOT.name}까지 안내합니다.`);

  // 모달의 처음과 마지막에서 Tab/Shift+Tab이 배경 화면으로 빠지지 않게 한다.
  const close = dialog.getByRole('button', { name: '어떤 앱으로 갈까요? 닫기' });
  const lastProvider = dialog.getByRole('button', { name: /티맵/ });
  // 현재 위치 조회가 끝나야 지도 앱 버튼이 활성화되어 탭 순서에 포함된다.
  await expect(lastProvider).toBeEnabled();
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(lastProvider).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(directions).toBeFocused();

  await page.getByRole('button', { name: '이전 화면으로 이동' }).focus();
  await page.keyboard.press('Enter');
  await expect(detailButton).toBeFocused();
  await expect(region.getByRole('radio', { name: '가격순' })).toBeChecked();
});

test.describe('길찾기 @directions', () => {
  test.use({ userAgent: ANDROID_USER_AGENT });

  test('3. 최근 이용한 주차장의 길찾기를 요청한다 @recent', async ({ page }) => {
    await mockCurrentLocation(page);
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
    await dismissSurveyIfPresent(page);
    await page.getByRole('button', { name: new RegExp(PARKING_LOT.name) }).click();

    const dialog = page.getByRole('dialog', { name: '어떤 앱으로 갈까요?' });
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

  test('4. 상세정보를 확인한 주차장의 길찾기를 요청한다 @recommend @parking-detail @recent', async ({
    page,
  }) => {
    await mockCurrentLocation(page);
    await goToRecommendedParkingDetail(page);
    expect(await page.evaluate(() => localStorage.getItem('recentParkingUses'))).toBeNull();

    await page.getByRole('button', { name: '길찾기 시작' }).click();
    const dialog = page.getByRole('dialog', { name: '어떤 앱으로 갈까요?' });
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
