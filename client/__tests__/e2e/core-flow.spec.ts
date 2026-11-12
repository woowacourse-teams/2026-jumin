import { expect, test, type Page } from '@playwright/test';

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

const closeSurvey = async (page: Page) => {
  await page.getByRole('button', { name: '서비스 이용 경험 설문 닫기' }).click();
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

const goToRecommendedParkingDetail = async (page: Page) => {
  await page.goto('/');
  await closeSurvey(page);
  await searchDestination(page);
  await requestRecommendation(page);

  const recommendation = page.getByRole('region', { name: '주차장 전체 목록' });
  // 추천순은 조회 시각의 운영 여부에 따라 바뀌므로, 항상 1위인 거리순에서 추천 카드를 연다.
  await recommendation.getByRole('radio', { name: '거리순' }).click();
  // 예상 요금은 조회 시각의 요일·운영 시간에 따라 달라지므로 목록 카드의 값을 기준으로 삼는다.
  const cardFee = await recommendation
    .locator('article', { has: page.getByRole('heading', { name: PARKING_LOT.name }) })
    .getByText(/원$|요금 정보 없음/)
    .textContent();
  await recommendation.getByRole('button', { name: `${PARKING_LOT.name} 상세정보` }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/parkingRecommend');
  await expect(page.getByRole('heading', { level: 1, name: PARKING_LOT.name })).toBeVisible();

  return { cardFee };
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

test('페이지 코드를 500ms 이상 기다리면 지도 위에 공통 스피너를 표시한다', async ({ page }) => {
  await page.goto('/');
  await closeSurvey(page);
  await expect(page.getByRole('button', { name: '목적지 검색' })).toBeVisible();

  let releaseChunk!: () => void;
  let notifyChunkRequested!: () => void;
  const chunkGate = new Promise<void>((resolve) => {
    releaseChunk = resolve;
  });
  const chunkRequested = new Promise<void>((resolve) => {
    notifyChunkRequested = resolve;
  });
  // 최초 페이지 로드 이후 요청되는 lazy 페이지 코드를 보류한다.
  // MSW의 Service Worker가 전달하는 네트워크 요청도 가로챈다.
  await page.context().route('**/assets/*.js', async (route) => {
    notifyChunkRequested();
    await chunkGate;
    await route.continue();
  });

  try {
    await Promise.all([chunkRequested, page.getByRole('button', { name: '목적지 검색' }).click()]);
    await expect(page.getByRole('button', { name: '목적지 검색' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: '지도', exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: '페이지를 불러오는 중' })).toBeVisible();
  } finally {
    releaseChunk();
  }

  await expect(page.getByRole('textbox', { name: '목적지 검색' })).toBeVisible();
  await expect(page.getByRole('status', { name: '페이지를 불러오는 중' })).toHaveCount(0);
});

test('서비스 페이지를 왕복한 뒤 지도와 검색 흐름을 사용할 수 있다', async ({ page }) => {
  await page.goto('/');
  await closeSurvey(page);
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

test('1. 추천 주차장의 상세정보를 확인한다', async ({ page }) => {
  const { cardFee } = await goToRecommendedParkingDetail(page);

  const detail = page.getByRole('region', { name: '주차장 상세정보', exact: true });
  await expect(detail.getByText(cardFee === '요금 정보 없음' ? '미제공' : cardFee!)).toBeVisible();
  await expect(detail.getByText('95m(2분)')).toBeVisible();
  await expect(detail.getByText('평일 08:00 – 20:00')).toBeVisible();
});

test('추천 URL을 새 탭에서 열거나 새로고침해도 목적지와 조회 조건을 유지한다', async ({ page }) => {
  await page.goto('/');
  await closeSurvey(page);
  await searchDestination(page);
  await requestRecommendation(page);
  const recommendationUrl = page.url();
  const params = new URL(recommendationUrl).searchParams;
  for (const key of ['lat', 'lng', 'name', 'entryAt', 'exitAt']) {
    expect(params.get(key)).toBeTruthy();
  }

  const sharedPage = await page.context().newPage();
  await sharedPage.goto(recommendationUrl);
  await closeSurvey(sharedPage);
  await expect(sharedPage.getByRole('region', { name: '주차장 전체 목록' })).toBeVisible();
  await expect(
    sharedPage.getByRole('heading', { level: 1, name: params.get('name')! }),
  ).toBeVisible();
  await sharedPage.reload();
  await closeSurvey(sharedPage);
  await expect(sharedPage.getByRole('region', { name: '주차장 전체 목록' })).toBeVisible();
  await expect(sharedPage).toHaveURL(recommendationUrl);
  await sharedPage.close();
});

test('추천·더보기 주차장 상세를 같은 화면에서 열고 선택과 정렬을 유지한다', async ({ page }) => {
  await page.goto('/');
  await closeSurvey(page);
  await searchDestination(page);
  await requestRecommendation(page);
  const region = page.getByRole('region', { name: '주차장 전체 목록' });
  // 동일 목록의 정렬 기준은 네이티브 라디오 입력으로 제공한다.
  for (const name of ['추천순', '거리순', '가격순']) {
    await expect(region.getByRole('radio', { name })).toBeVisible();
  }

  // 두 주차장 모두 거리로 고른 15곳 안에 있어, 조회 시각에 따라 추천·더보기 중 어디에 있든 확인할 수 있다.
  for (const name of ['강남역 센트럴푸르지오시티 주차장', '통일빌딩 주차장']) {
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
    await expect(region.getByRole('radio', { name: '추천순' })).toBeChecked();
  }
  await region.getByRole('radio', { name: '가격순' }).click();
  await region.getByRole('button', { name: `${PARKING_LOT.name} 상세정보` }).click();
  await expect(page.getByRole('button', { name: '길찾기 시작' })).toBeVisible();
  await page.getByRole('button', { name: '이전 화면으로 이동' }).click();
  await expect(region.getByRole('radio', { name: '가격순' })).toBeChecked();
});

test('2. 설정에서 가이드와 랜딩페이지를 확인하고 주차장 찾기를 시작한다', async ({ page }) => {
  await page.goto('/');
  await closeSurvey(page);
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
  await closeSurvey(page);

  await page.getByRole('link', { name: /주차의민족 소개/ }).click();
  await page
    .getByRole('navigation', { name: '랜딩페이지 메뉴' })
    .getByRole('link', { name: '기술 이야기', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: /보이지 않는 기술/ })).toBeInViewport();
  await page.getByRole('link', { name: '주차장 찾아보기', exact: true }).last().click();
  await expect(page).toHaveURL('/');
  await closeSurvey(page);
  await expect(page.getByRole('button', { name: '목적지 검색' })).toBeVisible();
});

test('키보드로 검색·정렬·상세·길찾기 모달을 조작하고 포커스를 복원한다', async ({ page }) => {
  await page.goto('/');
  await closeSurvey(page);

  // 진입 버튼의 Enter 동작과 검색 화면의 자동 포커스를 실제 브라우저에서 확인한다.
  await page.getByRole('button', { name: '목적지 검색' }).focus();
  await page.keyboard.press('Enter');
  const input = page.getByRole('textbox', { name: '목적지 검색' });
  await expect(input).toBeFocused();
  await input.fill('강남역');
  await expect(
    page.getByRole('region', { name: '목적지 검색 결과' }).getByRole('status'),
  ).toHaveText(/검색 결과 \d+곳/);
  await input.press('Enter');
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
    await closeSurvey(page);
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

  test('4. 상세정보를 확인한 주차장의 길찾기를 요청한다', async ({ page }) => {
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
