import { jest } from '@jest/globals';
import { act, cleanup, screen } from '@testing-library/react';
import { Outlet, Route, Routes } from 'react-router';

import { getMapCenterForMarkerY } from '../../src/shared/maps/getMapCenterForMarkerY';
import { ParkingInformationPanel } from '../../src/pages/HomePage/components/ParkingInformationPanel';
import { ParkingRecommendPage } from '../../src/pages/ParkingRecommendPage/ParkingRecommendPage';
import { parkingSearchQueryOptions } from '../../src/api/queries/parkingSearchQueryOptions';
import { viewportParkingLotDetailQueryOptions } from '../../src/api/queries/viewportParkingLotDetailQueryOptions';
import { parkingSearchSuccess } from '../../mocks/fixtures/parkingSearch';
import { parkingViewportLots } from '../../mocks/fixtures/parkingViewport';
import { viewportParkingLotDetailFixtures } from '../../mocks/fixtures/viewportParkingLotDetails';
import { createTestQueryClient, renderWithProviders } from '../renderWithProviders';
import { createRecommendationUrl, searchCondition } from '../testData';

class MockPoint {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

class MockOverlay {
  setMap() {}
  setIcon() {}
  setOptions() {}
  setPath() {}
}

const MAP_TOP = 100;
const CONDITION_BAR_BOTTOM = 220;
const MARKER_OFFSET_Y = 350;

let originalNaver: PropertyDescriptor | undefined;
let clickListeners: Set<{ target: unknown; callback: () => void }>;

beforeEach(() => {
  clickListeners = new Set();
  originalNaver = Object.getOwnPropertyDescriptor(globalThis, 'naver');
  Object.defineProperty(globalThis, 'naver', {
    configurable: true,
    value: {
      maps: {
        Point: MockPoint,
        LatLng: MockPoint,
        Size: MockPoint,
        Marker: MockOverlay,
        Circle: MockOverlay,
        Polyline: MockOverlay,
        Event: {
          addListener: (target: unknown, name: string, callback: () => void) => {
            const listener = { target, callback };
            if (name === 'click') clickListeners.add(listener);
            return listener;
          },
          removeListener: (listener: { target: unknown; callback: () => void }) => {
            clickListeners.delete(listener);
          },
        },
      },
    },
  });
});

afterEach(() => {
  cleanup();
  if (originalNaver) {
    Object.defineProperty(globalThis, 'naver', originalNaver);
  } else {
    Reflect.deleteProperty(globalThis, 'naver');
  }
});

// 실제 지도를 띄우지 않고 높이·목표 위치별로 중심 계산에 사용한 픽셀 좌표를 검증한다.
it.each([
  { label: '지도 중앙 위', height: 800, targetY: 236, centerY: 514 },
  { label: '높이가 다른 지도', height: 1000, targetY: 436, centerY: 414 },
  { label: '지도 중앙', height: 800, targetY: 400, centerY: 350 },
  { label: '지도 중앙 아래', height: 800, targetY: 600, centerY: 150 },
])('$label에 마커를 배치할 지도 중심을 계산한다', ({ height, targetY, centerY }) => {
  const position = {} as naver.maps.LatLng;
  const center = {} as naver.maps.Coord;
  // 마커의 현재 픽셀 위치를 (520, 350)으로 고정해 Y 보정 공식과 X 중앙 정렬을 확인한다.
  const fromCoordToOffset = jest.fn(() => new MockPoint(520, 350));
  const fromOffsetToCoord = jest.fn(() => center);
  const map = {
    getSize: () => ({ height }),
    getProjection: () => ({ fromCoordToOffset, fromOffsetToCoord }),
  } as unknown as naver.maps.Map;

  expect(getMapCenterForMarkerY(map, position, targetY)).toBe(center);
  expect(fromCoordToOffset).toHaveBeenCalledWith(position);
  expect(fromOffsetToCoord).toHaveBeenCalledWith(new MockPoint(520, centerY));
});

const createMap = () => {
  // 지도와 시트는 같은 부모 높이를 사용한다. jsdom에서는 창 높이를 부모 높이로 대신한다.
  const mapHeight = window.innerHeight;
  const element = document.createElement('div');
  jest
    .spyOn(element, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, MAP_TOP, 400, mapHeight));
  const fromCoordToOffset = jest.fn(() => new MockPoint(520, MARKER_OFFSET_Y));
  const panTo = jest.fn();
  const map = {
    getSize: () => ({ height: mapHeight }),
    getElement: () => element,
    getProjection: () => ({
      fromCoordToOffset,
      fromOffsetToCoord: (point: naver.maps.Point) => point,
    }),
    panTo,
  } as unknown as naver.maps.Map;

  return { map, panTo, fromCoordToOffset };
};

const mockConditionBarRect = () => {
  const originalGetRect = HTMLElement.prototype.getBoundingClientRect;
  // jsdom에는 레이아웃이 없으므로 검색 조건 바의 위치만 브라우저 좌표로 제공한다.
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute('aria-label') === '검색 조건'
      ? new DOMRect(0, CONDITION_BAR_BOTTOM - 60, 400, 60)
      : originalGetRect.call(this);
  });
};

const expectMarkerCenteredInVisibleArea = ({ map, panTo }: ReturnType<typeof createMap>) => {
  const sheetHeight = Number(
    screen.getByRole('slider', { name: '패널 높이 조절' }).getAttribute('aria-valuenow'),
  );
  const visibleTop = CONDITION_BAR_BOTTOM - MAP_TOP;
  const visibleBottom = map.getSize().height - sheetHeight;
  // 좌표 변환을 항등으로 돌려주는 지도 대역에서 panTo의 중심을 화면상 마커 위치로 환산한다.
  const targetMapCenter = panTo.mock.lastCall?.[0] as MockPoint | undefined;
  expect(targetMapCenter).toBeDefined();
  const markerYAfterPan = map.getSize().height / 2 + MARKER_OFFSET_Y - targetMapCenter!.y;

  expect(markerYAfterPan - visibleTop).toBeCloseTo(visibleBottom - markerYAfterPan);
};

// 지도 상단과 조건 바 하단이 어긋나도 각 시트 단계에서 보이는 영역 중앙을 사용한다.
it('홈 시트를 접거나 펼칠 때 선택한 주차장을 보이는 지도 영역 중앙으로 이동시킨다', () => {
  const mapHarness = createMap();
  const { map, panTo, fromCoordToOffset } = mapHarness;
  mockConditionBarRect();
  const parkingLot = parkingViewportLots[0]!;
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(
    viewportParkingLotDetailQueryOptions(parkingLot.id).queryKey,
    viewportParkingLotDetailFixtures[parkingLot.id],
  );
  const props = { map, parkingLot, onSnapChange: jest.fn(), onClose: jest.fn() };
  const { rerender } = renderWithProviders(
    <ParkingInformationPanel {...props} snap="collapsed" />,
    { queryClient },
  );
  expectMarkerCenteredInVisibleArea(mapHarness);

  rerender(<ParkingInformationPanel {...props} snap="medium" />);
  expect(fromCoordToOffset).toHaveBeenCalledWith(
    new MockPoint(parkingLot.latitude, parkingLot.longitude),
  );
  expectMarkerCenteredInVisibleArea(mapHarness);
  const moveCount = panTo.mock.calls.length;

  rerender(<ParkingInformationPanel {...props} snap="collapsed" />);
  expect(panTo).toHaveBeenCalledTimes(moveCount + 1);
  expectMarkerCenteredInVisibleArea(mapHarness);
});

it.each(['collapsed', 'medium'] as const)(
  '추천 시트가 %s일 때 선택한 주차장을 보이는 지도 영역으로 이동시킨다',
  (sheetSnap) => {
    const mapHarness = createMap();
    const { map, fromCoordToOffset } = mapHarness;
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(
      parkingSearchQueryOptions(searchCondition).queryKey,
      parkingSearchSuccess,
    );
    const parkingLot = parkingSearchSuccess.parkingLots[0]!;
    mockConditionBarRect();

    renderWithProviders(
      <Routes>
        <Route element={<Outlet context={{ map }} />}>
          <Route path="/parkingRecommend" element={<ParkingRecommendPage />} />
        </Route>
      </Routes>,
      {
        queryClient,
        initialEntries: [createRecommendationUrl()],
      },
    );

    expectMarkerCenteredInVisibleArea(mapHarness);
    expect(fromCoordToOffset).toHaveBeenCalledWith(
      new MockPoint(parkingLot.location.latitude, parkingLot.location.longitude),
    );
    if (sheetSnap === 'collapsed') {
      // 실제 지도 클릭으로 시트를 접으면 바뀐 경계 사이의 중앙으로 다시 이동한다.
      act(() => {
        [...clickListeners]
          .filter(({ target }) => target === map)
          .forEach(({ callback }) => callback());
      });
      expectMarkerCenteredInVisibleArea(mapHarness);
    }
  },
);
