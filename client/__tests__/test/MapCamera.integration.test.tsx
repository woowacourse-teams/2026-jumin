import { jest } from '@jest/globals';
import { act, cleanup } from '@testing-library/react';
import { Outlet, Route, Routes } from 'react-router';

import { getMapCenterForMarkerY } from '../../shared/maps/getMapCenterForMarkerY';
import { ParkingInformationPanel } from '../../src/pages/HomePage/components/ParkingInformationPanel';
import { ParkingRecommendPage } from '../../src/pages/ParkingRecommendPage/ParkingRecommendPage';
import { parkingSearchQueryOptions } from '../../api/queries/parkingSearchQuery';
import { viewportParkingLotDetailQueryOptions } from '../../api/queries/viewportParkingLotDetailQuery';
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
}

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
  const element = document.createElement('div');
  jest.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 400, 800));
  const fromCoordToOffset = jest.fn(() => new MockPoint(520, 350));
  const panTo = jest.fn();
  const map = {
    getSize: () => ({ height: 800 }),
    getElement: () => element,
    getProjection: () => ({
      fromCoordToOffset,
      fromOffsetToCoord: (point: naver.maps.Point) => point,
    }),
    panTo,
  } as unknown as naver.maps.Map;

  return { map, panTo, fromCoordToOffset };
};

it('홈 시트를 펼칠 때만 선택한 주차장을 시트 위로 이동시킨다', () => {
  const { map, panTo, fromCoordToOffset } = createMap();
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
  expect(panTo).not.toHaveBeenCalled();

  rerender(<ParkingInformationPanel {...props} snap="expanded" />);
  expect(fromCoordToOffset).toHaveBeenCalledWith(
    new MockPoint(parkingLot.latitude, parkingLot.longitude),
  );
  // 높이 800에서 시트 높이 500과 간격 64를 제외한 Y=236에 마커가 보여야 한다.
  expect(panTo).toHaveBeenLastCalledWith(new MockPoint(520, 514), expect.anything());
  const moveCount = panTo.mock.calls.length;

  rerender(<ParkingInformationPanel {...props} snap="collapsed" />);
  expect(panTo).toHaveBeenCalledTimes(moveCount);
});

it.each(['collapsed', 'expanded'] as const)(
  '추천 시트가 %s일 때 선택한 주차장을 보이는 지도 영역으로 이동시킨다',
  (sheetSnap) => {
    const { map, panTo } = createMap();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(
      parkingSearchQueryOptions(searchCondition).queryKey,
      parkingSearchSuccess,
    );
    const parkingLot = parkingSearchSuccess.parkingLots[0]!;
    const originalGetRect = HTMLElement.prototype.getBoundingClientRect;
    // jsdom에는 레이아웃이 없으므로 검색 조건 바의 위치만 브라우저 좌표로 제공한다.
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.getAttribute('aria-label') === '검색 조건'
        ? new DOMRect(0, 160, 400, 60)
        : originalGetRect.call(this);
    });

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

    if (sheetSnap === 'collapsed') {
      // 추천 view 복원 대신 실제 지도 클릭으로 시트를 접는다.
      act(() => {
        [...clickListeners]
          .filter(({ target }) => target === map)
          .forEach(({ callback }) => callback());
      });
      expect(panTo).toHaveBeenLastCalledWith(
        new MockPoint(parkingLot.location.latitude, parkingLot.location.longitude),
      );
    } else {
      // 지도 상단 100을 뺀 검색 바 하단 120과 시트 상단 300 사이의 중앙(Y=210).
      expect(panTo).toHaveBeenLastCalledWith(new MockPoint(520, 540), expect.anything());
    }
  },
);
