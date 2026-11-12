import { jest } from '@jest/globals';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { Route, Routes, useLocation, useNavigate } from 'react-router';
import { API_ERROR_MESSAGES } from '../../src/api/apiErrorMessages';
import { parkingSearchSuccess } from '../../mocks/fixtures/parkingSearch';
import { parkingDetailFixtures } from '../../mocks/fixtures/parkingDetails';
import { viewportParkingLotDetailFixtures } from '../../mocks/fixtures/viewportParkingLotDetails';
import { MapLayout } from '../../src/shared/maps/MapLayout';
import type { ParkingSearchCondition } from '../../src/shared/types/navigation';
import { ParkingRecommendPage } from '../../src/pages/ParkingRecommendPage/ParkingRecommendPage';
import { ParkingSetupPage } from '../../src/pages/ParkingSetupPage/ParkingSetupPage';
import { renderWithProviders } from '../renderWithProviders';
import { server } from '../msw/server';
import { createRecommendationUrl } from '../testData';

const condition: ParkingSearchCondition = {
  destinationName: '강남역',
  destinationLatitude: 37.4981,
  destinationLongitude: 127.0279,
  entryAt: '2030-10-27T10:00:00+09:00',
  exitAt: '2030-10-27T11:00:00+09:00',
};

class LatLng {
  constructor(
    private latitude: number,
    private longitude: number,
  ) {}
  lat() {
    return this.latitude;
  }
  lng() {
    return this.longitude;
  }
}

let markers: Marker[];
let listeners: Set<{ target: unknown; name: string; callback: () => void }>;
class Marker {
  options: naver.maps.MarkerOptions;
  attached = true;
  constructor(options: naver.maps.MarkerOptions) {
    this.options = options;
    markers.push(this);
  }
  setMap(map: unknown) {
    this.attached = map !== null;
  }
  setIcon(icon: naver.maps.ImageIcon) {
    this.options.icon = icon;
  }
  setOptions(key: 'zIndex', value: number | undefined) {
    this.options[key] = value;
  }
}

const projectionInput = jest.fn((point: LatLng) => ({ x: point.lng(), y: point.lat() }));
const mapElement = document.createElement('div');
const map = {
  getCenter: () => new LatLng(37.4981, 127.0279),
  getElement: () => mapElement,
  getSize: () => ({ width: 390, height: 844 }),
  getProjection: () => ({
    fromCoordToOffset: projectionInput,
    fromOffsetToCoord: (point: { x: number; y: number }) => new LatLng(point.y, point.x),
  }),
  panTo: jest.fn(),
  panBy: jest.fn(),
  fitBounds: jest.fn(),
  setCenter: jest.fn(),
  // 셋업이 기존 지도 옵션을 저장·복구할 때 사용하는 SDK 인터페이스를 제공한다.
  getOptions: jest.fn(),
  setOptions: jest.fn(),
  destroy: jest.fn(),
};
const createMap = jest.fn(() => map);
let originalNaver: PropertyDescriptor | undefined;
let detailRequests: URL[];
let searchRequests: URL[];
let originalScrollBy: PropertyDescriptor | undefined;
let originalScrollTo: PropertyDescriptor | undefined;

beforeEach(() => {
  markers = [];
  listeners = new Set();
  detailRequests = [];
  searchRequests = [];
  originalNaver = Object.getOwnPropertyDescriptor(globalThis, 'naver');
  Object.defineProperty(globalThis, 'naver', {
    configurable: true,
    value: {
      maps: {
        Map: createMap,
        Marker,
        LatLng,
        LatLngBounds: class {},
        Size: class {},
        Point: class {
          constructor(
            public x: number,
            public y: number,
          ) {}
        },
        Circle: class {
          setMap() {}
        },
        Polyline: class {
          setMap() {}
          setPath() {}
        },
        Event: {
          addListener: (target: unknown, name: string, callback: () => void) => {
            const listener = { target, name, callback };
            listeners.add(listener);
            return listener;
          },
          removeListener: (listener: { target: unknown; name: string; callback: () => void }) =>
            listeners.delete(listener),
        },
      },
    },
  });
  originalScrollBy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollBy');
  originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
    configurable: true,
    value: jest.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: jest.fn(),
  });
  server.use(
    http.get('/api/parking/search', ({ request }) => {
      searchRequests.push(new URL(request.url));
      return HttpResponse.json(parkingSearchSuccess);
    }),
    http.get('/api/parking/:parkingLotId', ({ request, params }) => {
      detailRequests.push(new URL(request.url));
      return HttpResponse.json(parkingDetailFixtures[Number(params.parkingLotId)]);
    }),
    http.get('/api/parking/viewport/:parkingLotId', ({ params }) =>
      HttpResponse.json(viewportParkingLotDetailFixtures[Number(params.parkingLotId)]),
    ),
  );
});

afterEach(() => {
  if (originalNaver) Object.defineProperty(globalThis, 'naver', originalNaver);
  else Reflect.deleteProperty(globalThis, 'naver');
  if (originalScrollBy) Object.defineProperty(HTMLElement.prototype, 'scrollBy', originalScrollBy);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollBy');
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

const LocationProbe = () => {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <p aria-label="현재 경로">{pathname + search}</p>
      <button onClick={() => navigate(-1)}>브라우저 뒤로가기</button>
    </>
  );
};
const renderRecommendation = (url = createRecommendationUrl(condition)) =>
  renderWithProviders(
    <>
      <LocationProbe />
      <Routes>
        <Route path="/origin" element={<h1>이전 페이지</h1>} />
        <Route path="/" element={<h1>홈 화면</h1>} />
        <Route path="/search" element={<h1>목적지 검색 화면</h1>} />
        <Route element={<MapLayout />}>
          <Route path="/parkingsetup" element={<ParkingSetupPage />} />
          <Route path="/parkingRecommend" element={<ParkingRecommendPage />} />
        </Route>
      </Routes>
    </>,
    {
      initialEntries: ['/origin', url],
    },
  );

const lot = (id: number) =>
  parkingSearchSuccess.parkingLots.find((parkingLot) => parkingLot.id === id)!;
const openDetail = async (id: number) => {
  const region = await screen.findByRole('region', { name: '주차장 전체 목록' });
  await userEvent
    .setup()
    .click(within(region).getByRole('button', { name: `${lot(id).name} 상세정보` }));
};
const closeDetail = () =>
  userEvent.setup().click(screen.getByRole('button', { name: '이전 화면으로 이동' }));

it('드래그·관성·목적지 이름 조회 중 추천을 막고 최종 좌표로 추천한다', async () => {
  let releaseGeocode!: () => void;
  const geocodeGate = new Promise<void>((resolve) => {
    releaseGeocode = resolve;
  });
  const geocodeRequests: URL[] = [];
  server.use(
    http.get('/api/destinations/reverse-geocode', async ({ request }) => {
      geocodeRequests.push(new URL(request.url));
      await geocodeGate;
      return HttpResponse.json({ displayName: '관성 이동 후 목적지' });
    }),
  );
  const center = jest.spyOn(map, 'getCenter');
  const emitMapEvent = (eventName: string) => {
    act(() => {
      [...listeners]
        .filter(({ target, name }) => target === map && name === eventName)
        .forEach(({ callback }) => callback());
    });
  };

  renderRecommendation('/parkingsetup?lat=37.4981&lng=127.0279&name=강남역');
  const nextButton = await screen.findByRole('button', { name: '다음' });
  // 시트는 SDK 준비 전에도 표시되므로 지도 생성과 이벤트 등록까지 기다린다.
  await waitFor(() =>
    expect(
      [...listeners].filter(({ target, name }) => target === map && name === 'dragstart'),
    ).toHaveLength(1),
  );
  expect(nextButton).toBeEnabled();

  try {
    // 손을 떼어도 관성 이동이 남아 있으면 URL과 조회를 갱신하지 않는다.
    emitMapEvent('dragstart');
    expect(nextButton).toBeDisabled();
    expect(screen.getByRole('region', { name: '선택한 목적지' })).toHaveTextContent(
      '위치 확인 중...',
    );
    center.mockReturnValue(new LatLng(37.58, 127.01));
    emitMapEvent('dragend');
    expect(nextButton).toBeDisabled();
    expect(screen.getByLabelText('현재 경로')).toHaveTextContent('lat=37.4981');
    expect(geocodeRequests).toHaveLength(0);

    // SDK 애니메이션 대신 중심 변경과 idle을 발생시켜 최종 좌표 확정을 재현한다.
    center.mockReturnValue(new LatLng(37.59, 127.02));
    emitMapEvent('idle');
    await waitFor(() => expect(geocodeRequests).toHaveLength(1));
    expect(geocodeRequests[0]!.searchParams.get('latitude')).toBe('37.59');
    expect(geocodeRequests[0]!.searchParams.get('longitude')).toBe('127.02');
    expect(screen.getByLabelText('현재 경로')).toHaveTextContent('lat=37.59&lng=127.02');
    expect(nextButton).toBeDisabled();

    // 좌표와 그 좌표의 이름이 함께 준비된 뒤에만 추천할 수 있어야 한다.
    releaseGeocode();
    await screen.findByRole('heading', { name: '관성 이동 후 목적지' });
    await waitFor(() => expect(nextButton).toBeEnabled());
    await userEvent.setup().click(nextButton);
    await screen.findByRole('region', { name: '주차장 전체 목록' });
    expect(searchRequests.at(-1)!.searchParams.get('destinationLatitude')).toBe('37.59');
    expect(searchRequests.at(-1)!.searchParams.get('destinationLongitude')).toBe('127.02');
  } finally {
    // 중간 검증 실패 시에도 MSW 요청이 대기한 채 다음 테스트로 넘어가지 않게 한다.
    releaseGeocode();
  }
});

it('state 없이 URL 조건으로 추천을 조회하고, 선택한 주차장의 상세를 구분한다', async () => {
  renderRecommendation();
  await screen.findByRole('region', { name: '주차장 전체 목록' });
  expect(detailRequests).toHaveLength(0);
  const searchParams = searchRequests[0]!.searchParams;
  for (const [key, value] of Object.entries(condition)) {
    if (key !== 'destinationName') expect(searchParams.get(key)).toBe(String(value));
  }
  for (const { id, capacityLabel, availableSpacesLabel } of [
    { id: 101, capacityLabel: '42면', availableSpacesLabel: '8대' },
    { id: 102, capacityLabel: '28면', availableSpacesLabel: '0대 (만차)' },
    { id: 103, capacityLabel: '미제공', availableSpacesLabel: '미제공' },
  ]) {
    await openDetail(id);
    await screen.findByText('기본 30분');
    const detail = within(screen.getByRole('region', { name: '주차장 상세정보' }));
    // 두 값 모두 null인 경우에도 각각의 행에 미제공을 표시한다.
    const expectedCount = capacityLabel === availableSpacesLabel ? 2 : 1;
    expect(detail.getAllByText(capacityLabel)).toHaveLength(expectedCount);
    expect(detail.getAllByText(availableSpacesLabel)).toHaveLength(expectedCount);
    const request = detailRequests.at(-1)!;
    expect(request.pathname).toBe(`/api/parking/${id}`);
    for (const [key, value] of Object.entries(condition)) {
      if (key !== 'destinationName') expect(request.searchParams.get(key)).toBe(String(value));
    }
    expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/parkingRecommend');
    await closeDetail();
  }
  expect(createMap).toHaveBeenCalledTimes(1);
});

it('상세 왕복에서 목록 DOM·정렬·선택·추천 시트 상태를 유지한다', async () => {
  renderRecommendation();
  const region = await screen.findByRole('region', { name: '주차장 전체 목록' });
  // 정렬은 탭 패널 전환이 아니라 동일 목록의 단일 기준 선택이다.
  await userEvent.setup().click(within(region).getByRole('radio', { name: '가격순' }));
  const rows = within(region).getByRole('list');
  rows.scrollTop = 210;
  await openDetail(108);
  await screen.findByText('기본 30분');
  expect(rows.isConnected).toBe(true); // 목록 DOM 유지는 이번 병합의 명시적인 계약이다.
  expect(screen.queryByRole('region', { name: '주차장 전체 목록' })).not.toBeInTheDocument();
  expect(markers.filter((marker) => marker.attached).map(({ options }) => options.title)).toEqual(
    expect.arrayContaining([condition.destinationName, lot(108).name]),
  );
  expect(markers.filter((marker) => marker.attached)).toHaveLength(2);
  act(() => {
    [...listeners]
      .filter(({ target, name }) => target === map && name === 'click')
      .forEach(({ callback }) => callback());
  });
  await closeDetail();
  expect(within(region).getByRole('radio', { name: '가격순' })).toBeChecked();
  expect(within(region).getByRole('button', { name: `${lot(108).name} 선택` })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(rows.scrollTop).toBe(210);
  expect(
    [...listeners].filter(({ target, name }) => target === map && name === 'click'),
  ).toHaveLength(1);
  expect(createMap).toHaveBeenCalledTimes(1);
});

it('방향키로 정렬을 바꾸고 상세를 닫으면 열었던 목록 버튼으로 포커스가 복귀한다', async () => {
  renderRecommendation();
  const user = userEvent.setup();
  const region = await screen.findByRole('region', { name: '주차장 전체 목록' });
  const recommended = within(region).getByRole('radio', { name: '추천순' });

  // 네이티브 라디오 그룹의 방향키 조작으로 선택과 포커스를 함께 바꾼다.
  recommended.focus();
  await user.keyboard('{ArrowRight}{ArrowRight}');
  const price = within(region).getByRole('radio', { name: '가격순' });
  expect(price).toBeChecked();
  expect(price).toHaveFocus();

  // 숨겨지는 추천 목록에 포커스가 남지 않게 하고, 복귀 후 키보드 탐색을 이어간다.
  const detailButton = within(region).getByRole('button', { name: `${lot(101).name} 상세정보` });
  detailButton.focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('heading', { level: 1, name: lot(101).name })).toHaveFocus();
  await closeDetail();
  expect(detailButton).toHaveFocus();
  expect(price).toBeChecked();
});

it.each([101, 108])(
  '추천/더보기 항목 %s 선택 및 재선택 때 해당 좌표로 지도를 이동한다',
  async (id) => {
    renderRecommendation();
    const region = await screen.findByRole('region', { name: '주차장 전체 목록' });
    const button = within(region).getByRole('button', { name: `${lot(id).name} 선택` });
    for (let count = 0; count < 2; count++) {
      map.panTo.mockClear();
      await userEvent.setup().click(button);
      expect(projectionInput).toHaveBeenLastCalledWith(
        new LatLng(lot(id).location.latitude, lot(id).location.longitude),
      );
      expect(map.panTo).toHaveBeenCalledTimes(1);
      expect(button).toHaveAttribute('aria-pressed', 'true');
    }
  },
);

it('마커를 누르면 해당 목록 항목을 보이게 스크롤하고 상세 복귀 때도 노출한다', async () => {
  renderRecommendation();
  const region = await screen.findByRole('region', { name: '주차장 전체 목록' });
  const rows = within(region).getByRole('list');
  const button = within(rows).getByRole('button', { name: `${lot(108).name} 선택` });
  // SDK와 jsdom은 실제 레이아웃이 없으므로 화면 밖 항목의 측정값을 제공한다.
  const row = button.closest('li')!;
  jest.spyOn(rows, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 390, 300));
  jest.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 650, 390, 100));
  const scroll = jest.spyOn(rows, 'scrollBy');
  const marker = markers.find(
    ({ options, attached }) => attached && options.title === lot(108).name,
  )!;
  act(() => {
    [...listeners]
      .filter(({ target, name }) => target === marker && name === 'click')
      .forEach(({ callback }) => callback());
  });
  expect(scroll).toHaveBeenLastCalledWith({ top: 350, behavior: 'auto' });
  expect(button).toHaveAttribute('aria-pressed', 'true');
  await openDetail(108);
  await screen.findByText('기본 30분');
  scroll.mockClear();
  await closeDetail();
  expect(scroll).toHaveBeenLastCalledWith({ top: 350, behavior: 'auto' });
});

it.each(['/api/parking/101', '/api/parking/viewport/101'])(
  '%s 실패를 상세에 한정하고 재시도로 회복한다',
  async (endpoint) => {
    server.use(http.get(endpoint, () => new HttpResponse(null, { status: 500 })));
    renderRecommendation();
    await openDetail(101);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(API_ERROR_MESSAGES.PARKING_DETAIL);
    expect(screen.getByRole('region', { name: '지도' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전 화면으로 이동' })).toBeEnabled();
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json(
          endpoint.includes('viewport')
            ? viewportParkingLotDetailFixtures[101]
            : parkingDetailFixtures[101],
        ),
      ),
    );
    await userEvent.setup().click(within(alert).getByRole('button', { name: '다시 시도' }));
    await screen.findByText('기본 30분');
    await closeDetail();
    expect(await screen.findByRole('region', { name: '주차장 전체 목록' })).toBeInTheDocument();
  },
);

it('상세 로딩 중에도 추천으로 돌아와 다른 주차장을 열 수 있다', async () => {
  server.use(
    http.get('/api/parking/101', async () => {
      await delay(500);
      return HttpResponse.json(parkingDetailFixtures[101]);
    }),
  );
  renderRecommendation();
  await openDetail(101);
  await screen.findByRole('status', { name: '주차장 상세정보를 불러오는 중' });
  await closeDetail();
  await openDetail(102);
  await screen.findByText('기본 30분');
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(lot(102).name);
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
});

it('목적지 좌표가 없는 추천 URL은 홈으로 안내한다', async () => {
  renderRecommendation('/parkingRecommend');
  await screen.findByRole('heading', { name: '홈 화면' });
  expect(searchRequests).toHaveLength(0);
});

it('날짜가 잘못된 추천 URL은 목적지를 보존해 셋업으로 교체한다', async () => {
  renderRecommendation(createRecommendationUrl({ ...condition, entryAt: 'invalid' }));
  await screen.findByRole('heading', { name: condition.destinationName });
  const url = new URL(screen.getByLabelText('현재 경로').textContent!, 'http://localhost');
  expect(url.pathname).toBe('/parkingsetup');
  expect(url.searchParams.get('lat')).toBe(String(condition.destinationLatitude));
  expect(url.searchParams.get('lng')).toBe(String(condition.destinationLongitude));
  expect(url.searchParams.get('name')).toBe(condition.destinationName);
  expect(url.searchParams.has('entryAt')).toBe(false);
  expect(url.searchParams.has('exitAt')).toBe(false);
  expect(searchRequests).toHaveLength(0);

  await userEvent.setup().click(screen.getByRole('button', { name: '브라우저 뒤로가기' }));
  await screen.findByRole('heading', { name: '이전 페이지' });
});
