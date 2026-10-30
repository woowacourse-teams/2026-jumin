import { jest } from '@jest/globals';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { Route, Routes, useLocation, useNavigate } from 'react-router';
import { API_ERROR_MESSAGES } from '../../api/apiErrorMessages';
import { parkingSearchSuccess } from '../../mocks/fixtures/parkingSearch';
import { parkingDetailFixtures } from '../../mocks/fixtures/parkingDetails';
import { viewportParkingLotDetailFixtures } from '../../mocks/fixtures/viewportParkingLotDetails';
import { MapLayout } from '../../shared/maps/MapLayout';
import type { ParkingSearchCondition } from '../../shared/types/navigation';
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
  await userEvent.setup().click(within(region).getByRole('tab', { name: '가격순' }));
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
  expect(within(region).getByRole('tab', { name: '가격순' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
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
