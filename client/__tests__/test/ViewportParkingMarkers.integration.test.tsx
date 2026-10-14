import { act, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { Outlet, Route, Routes } from 'react-router';

import { parkingLotViewportResponseSchema } from '../../api/parkingLotsSchema';
import { gangnamStationParkingLots } from '../../mocks/fixtures/gangnamStationParkingLots';
import { parkingViewportLots } from '../../mocks/fixtures/parkingViewport';
import { viewportParkingLotDetailFixtures } from '../../mocks/fixtures/viewportParkingLotDetails';
import { HomePage } from '../../src/pages/HomePage/HomePage';
import { ViewportParkingMarkers } from '../../src/pages/HomePage/components/ViewportParkingMarkers';
import type { MapViewport } from '../../src/pages/HomePage/hooks/useMapViewport';
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
    onSelectedParkingLotMissing: jest.fn(),
  };
  const { rerender } = renderWithProviders(<ViewportParkingMarkers {...props} />);

  await waitFor(() => expect(activeMarkers()).toHaveLength(parkingViewportLots.length));
  expect(activeMarkers().filter(({ iconSize }) => iconSize.width === 20)).toHaveLength(10);
  expect(activeMarkers().filter(({ iconSize }) => iconSize.width === 28)).toHaveLength(
    parkingViewportLots.length - 10,
  );
  expect(markerFor(105)?.iconSize.width).toBe(28);
  expect(markerFor(201)?.iconSize.width).toBe(28);
  expect(markerFor(216)?.anchor).toEqual(new TestPoint(10, 10));
  expect(markerFor(105)?.anchor).toEqual(new TestPoint(14, 14));

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
    onSelectedParkingLotMissing: jest.fn(),
  };
  const { rerender } = renderWithProviders(<ViewportParkingMarkers {...props} />);

  await waitFor(() => expect(activeMarkers()).toHaveLength(parkingViewportLots.length));
  rerender(<ViewportParkingMarkers {...props} viewport={{ ...viewport, zoom: 16 }} />);

  expect(activeMarkers().filter(({ iconSize }) => iconSize.width === 20)).toHaveLength(
    parkingViewportLots.length - 1,
  );
  expect(markerFor(105)?.iconSize.width).toBe(30);
  expect(activeMarkers().filter(({ iconSize }) => iconSize.width === 28)).toHaveLength(0);
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
