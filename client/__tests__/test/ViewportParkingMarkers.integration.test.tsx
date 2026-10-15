import { act, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { http, HttpResponse } from 'msw';
import { Outlet, Route, Routes } from 'react-router';

import { parkingLotViewportResponseSchema } from '../../api/parkingLotsSchema';
import { gangnamStationParkingLots } from '../../mocks/fixtures/gangnamStationParkingLots';
import { parkingViewportLots } from '../../mocks/fixtures/parkingViewport';
import { viewportParkingLotDetailFixtures } from '../../mocks/fixtures/viewportParkingLotDetails';
import { HomePage } from '../../src/pages/HomePage/HomePage';
import { ViewportParkingMarkers } from '../../src/pages/HomePage/components/ViewportParkingMarkers';
import type { MapViewport } from '../../src/pages/HomePage/hooks/useMapViewport';
import { server } from '../msw/server';
import { renderWithProviders } from '../renderWithProviders';

class TestSize {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
}

class TestPoint {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
}

class TestLatLng {
  constructor(
    readonly latitude: number,
    readonly longitude: number,
  ) {}

  lat() {
    return this.latitude;
  }

  lng() {
    return this.longitude;
  }
}

class TestMarker {
  readonly position: TestLatLng;
  readonly iconSize: TestSize;
  readonly anchor: TestPoint;
  readonly zIndex: number | undefined;
  onClick?: () => void;
  active = true;

  constructor(options: {
    position: TestLatLng;
    icon: { size: TestSize; anchor: TestPoint };
    zIndex?: number;
  }) {
    this.position = options.position;
    this.iconSize = options.icon.size;
    this.anchor = options.icon.anchor;
    this.zIndex = options.zIndex;
    markers.push(this);
  }

  setMap(map: unknown) {
    this.active = map !== null;
  }
}

const markers: TestMarker[] = [];
const activeMarkers = () => markers.filter(({ active }) => active);
const representativeMarkers = () =>
  activeMarkers().filter(({ anchor }) => anchor.x === 12.5 && anchor.y === 25);
const dotMarkers = () => activeMarkers().filter(({ anchor }) => anchor.x === 5 && anchor.y === 5);
const markerFor = (id: number) => {
  const parkingLot = parkingViewportLots.find((lot) => lot.id === id);
  return activeMarkers().find(
    ({ position }) =>
      position.latitude === parkingLot?.latitude && position.longitude === parkingLot?.longitude,
  );
};

const viewport: MapViewport = {
  zoom: 15,
  southLatitude: 37,
  westLongitude: 126,
  northLatitude: 38,
  eastLongitude: 128,
};
const map = {} as naver.maps.Map;

beforeAll(() => {
  Object.defineProperty(globalThis, 'naver', {
    configurable: true,
    value: {
      maps: {
        Size: TestSize,
        Point: TestPoint,
        LatLng: TestLatLng,
        Marker: TestMarker,
        Event: {
          addListener: (target: TestMarker, event: string, callback: () => void) => {
            if (event === 'click') target.onClick = callback;
            return { target };
          },
          removeListener: (listener: { target: TestMarker }) => {
            listener.target.onClick = undefined;
          },
        },
      },
    },
  });
});

beforeEach(() => {
  markers.length = 0;
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'naver');
});

it('LOD 목 응답의 score를 숫자로 검증한다', () => {
  expect(
    parkingLotViewportResponseSchema.safeParse({
      totalCount: parkingViewportLots.length,
      parkingLots: parkingViewportLots,
    }).success,
  ).toBe(true);

  expect(
    parkingLotViewportResponseSchema.safeParse({
      totalCount: 1,
      parkingLots: [{ ...parkingViewportLots[0], score: '0.5' }],
    }).success,
  ).toBe(false);
});

it('강남역 주변 CSV 주차장 100개와 해당 상세 응답을 제공한다', () => {
  expect(gangnamStationParkingLots).toHaveLength(100);
  expect(gangnamStationParkingLots[0]).toEqual(
    expect.objectContaining({ name: '시계탑빌딩 주차장', capacity: 36 }),
  );
  expect(parkingViewportLots).toHaveLength(112);
  expect(new Set(parkingViewportLots.map(({ id }) => id)).size).toBe(112);
  expect(parkingViewportLots.find(({ id }) => id === 201)?.score).toBe(36 / (36 + 50));
  expect(
    gangnamStationParkingLots.every(
      ({ id, sourceExternalId, latitude, longitude, feeRule, dailyOperations }) =>
        sourceExternalId.length > 0 &&
        Math.abs(latitude - 37.4981) < 0.007 &&
        Math.abs(longitude - 127.0279) < 0.007 &&
        viewportParkingLotDetailFixtures[id]?.feeRule === feeRule &&
        viewportParkingLotDetailFixtures[id]?.dailyOperations === dailyOperations,
    ),
  ).toBe(true);
});

it('줌 15에서 점수 상위 10개만 대표 마커로 표시하고 점도 선택할 수 있다', async () => {
  const onSelect = jest.fn();
  const props = {
    map,
    viewport,
    selectedParkingLotId: null,
    onSelect,
  };
  const { rerender } = renderWithProviders(<ViewportParkingMarkers {...props} />);

  await waitFor(() => expect(activeMarkers()).toHaveLength(parkingViewportLots.length));
  expect(representativeMarkers()).toHaveLength(10);
  expect(dotMarkers()).toHaveLength(parkingViewportLots.length - 10);
  expect(markerFor(105)?.anchor).toEqual(new TestPoint(5, 5));
  expect(markerFor(201)?.anchor).toEqual(new TestPoint(5, 5));
  expect(markerFor(216)?.anchor).toEqual(new TestPoint(12.5, 25));

  act(() => markerFor(216)?.onClick?.());
  expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: 216 }));
  rerender(<ViewportParkingMarkers {...props} selectedParkingLotId={216} />);
  expect(markerFor(216)?.iconSize).toEqual(new TestSize(30, 33));

  act(() => markerFor(105)?.onClick?.());
  expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: 105, score: 0 }));

  rerender(<ViewportParkingMarkers {...props} selectedParkingLotId={105} />);
  expect(markerFor(105)?.iconSize).toEqual(new TestSize(30, 33));
  expect(markerFor(105)?.anchor).toEqual(new TestPoint(15, 33));
  expect(markerFor(105)?.zIndex).toBe(20);
});

it('줌 15보다 확대하면 모든 주차장을 대표 마커로 표시하고 선택 상태를 유지한다', async () => {
  const props = {
    map,
    viewport,
    selectedParkingLotId: 105,
    onSelect: jest.fn(),
  };
  const { rerender } = renderWithProviders(<ViewportParkingMarkers {...props} />);

  await waitFor(() => expect(activeMarkers()).toHaveLength(parkingViewportLots.length));
  rerender(<ViewportParkingMarkers {...props} viewport={{ ...viewport, zoom: 16 }} />);

  expect(representativeMarkers()).toHaveLength(parkingViewportLots.length - 1);
  expect(markerFor(105)?.anchor).toEqual(new TestPoint(15, 33));
  expect(dotMarkers()).toHaveLength(0);
});

it('줌 15와 16은 화면 중앙을 축소해 조회하고 줌 17은 전체 화면을 조회한다', async () => {
  const requestUrls: URL[] = [];
  server.use(
    http.get('/api/parking/viewport', ({ request }) => {
      requestUrls.push(new URL(request.url));
      return HttpResponse.json({ totalCount: 0, parkingLots: [] });
    }),
  );

  const props = {
    map,
    selectedParkingLotId: null,
    filters: { freeOnly: true, excludeMechanical: false },
    onSelect: jest.fn(),
  };
  const { rerender } = renderWithProviders(
    <ViewportParkingMarkers {...props} viewport={viewport} />,
  );

  await waitFor(() => expect(requestUrls).toHaveLength(1));
  rerender(
    <ViewportParkingMarkers
      {...props}
      viewport={{
        zoom: 16,
        southLatitude: 37.25,
        westLongitude: 126.5,
        northLatitude: 37.75,
        eastLongitude: 127.5,
      }}
    />,
  );
  await waitFor(() => expect(requestUrls).toHaveLength(2));
  rerender(
    <ViewportParkingMarkers
      {...props}
      viewport={{
        zoom: 17,
        southLatitude: 37.375,
        westLongitude: 126.75,
        northLatitude: 37.625,
        eastLongitude: 127.25,
      }}
    />,
  );
  await waitFor(() => expect(requestUrls).toHaveLength(3));

  const requestedBounds = requestUrls.map(({ searchParams }) => ({
    south: Number(searchParams.get('southLatitude')),
    west: Number(searchParams.get('westLongitude')),
    north: Number(searchParams.get('northLatitude')),
    east: Number(searchParams.get('eastLongitude')),
  }));
  const [zoom15Bounds, zoom16Bounds, zoom17Bounds] = requestedBounds;
  if (!zoom15Bounds || !zoom16Bounds || !zoom17Bounds) {
    throw new Error('줌별 뷰포트 요청이 모두 기록되지 않았습니다.');
  }

  expect(zoom15Bounds.north - zoom15Bounds.south).toBeCloseTo(0.55, 3);
  expect(zoom15Bounds.east - zoom15Bounds.west).toBeCloseTo(1.4, 3);
  expect(zoom16Bounds.north - zoom16Bounds.south).toBeCloseTo(0.35, 3);
  expect(zoom16Bounds.east - zoom16Bounds.west).toBeCloseTo(0.85, 3);
  expect(zoom17Bounds).toEqual({
    south: 37.375,
    west: 126.75,
    north: 37.625,
    east: 127.25,
  });
  for (const { south, west, north, east } of requestedBounds) {
    expect((south + north) / 2).toBeCloseTo(37.5, 3);
    expect((west + east) / 2).toBeCloseTo(127, 3);
  }
  expect(requestUrls.every(({ searchParams }) => searchParams.get('freeOnly') === 'true')).toBe(
    true,
  );
});

it('줌 15보다 축소하면 마커 대신 기존 확대 안내를 표시한다', async () => {
  const zoomedOutMap = {
    getZoom: () => 14,
    getBounds: () => ({
      getSW: () => new TestLatLng(37, 126),
      getNE: () => new TestLatLng(38, 128),
    }),
  } as unknown as naver.maps.Map;
  const Layout = () => <Outlet context={{ map: zoomedOutMap }} />;

  renderWithProviders(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
      </Route>
    </Routes>,
  );

  expect(await screen.findByRole('status')).toHaveTextContent(
    '지도를 확대해서 주차장을 찾아보세요.',
  );
  expect(activeMarkers()).toHaveLength(0);
});
