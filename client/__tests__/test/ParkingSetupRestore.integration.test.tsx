import { jest } from '@jest/globals';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useOutletContext } from 'react-router';

import { MapLayout } from '../../shared/maps/MapLayout';
import type { ParkingSetupView } from '../../shared/types/navigation';
import { ParkingRecommendPage } from '../../src/pages/ParkingRecommendPage/ParkingRecommendPage';
import { ParkingSetupPage } from '../../src/pages/ParkingSetupPage/ParkingSetupPage';
import { destinationFixtures } from '../../mocks/fixtures/destinations';
import { server } from '../msw/server';
import { renderWithProviders } from '../renderWithProviders';

const destination = destinationFixtures[0]!;

class MockLatLng {
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

const movedLocation = { latitude: 37.51, longitude: 127.04 };
const movedName = '지도에서 이동한 목적지';
const savedView: ParkingSetupView = {
  selectedLocation: movedLocation,
  hasMovedMap: true,
};

const createMockMap = () => {
  let center = new MockLatLng(0, 0);
  const setCenter = jest.fn((point: MockLatLng) => {
    center = point;
  });

  return {
    map: {
      getCenter: () => center,
      setCenter,
      panTo: jest.fn(),
      setOptions: jest.fn(),
      destroy: jest.fn(),
    } as unknown as naver.maps.Map,
    setCenter,
    moveCenter(latitude: number, longitude: number) {
      center = new MockLatLng(latitude, longitude);
    },
  };
};

let mockMap: ReturnType<typeof createMockMap>;
let originalNaver: PropertyDescriptor | undefined;
let dragEndListeners: Set<() => void>;

function createMap(_element: HTMLElement, options: naver.maps.MapOptions) {
  const center = options.center as naver.maps.LatLng;
  mockMap.moveCenter(center.lat(), center.lng());
  return mockMap.map;
}

const createNaverMap = jest.fn(createMap);

beforeEach(() => {
  mockMap = createMockMap();
  dragEndListeners = new Set();
  originalNaver = Object.getOwnPropertyDescriptor(globalThis, 'naver');

  Object.defineProperty(globalThis, 'naver', {
    configurable: true,
    value: {
      maps: {
        LatLng: MockLatLng,
        LatLngBounds: class {},
        Map: createNaverMap,
        Event: {
          addListener: (_target: unknown, eventName: string, listener: () => void) => {
            if (eventName === 'dragend') dragEndListeners.add(listener);
            return listener;
          },
          removeListener: (listener: () => void) => {
            dragEndListeners.delete(listener);
          },
        },
      },
    },
  });

  server.use(
    http.get('/api/destinations/reverse-geocode', () =>
      HttpResponse.json({ displayName: movedName }),
    ),
  );
});

afterEach(() => {
  if (originalNaver) {
    Object.defineProperty(globalThis, 'naver', originalNaver);
  } else {
    Reflect.deleteProperty(globalThis, 'naver');
  }
});

const MapReadyProbe = () => {
  const { map } = useOutletContext<{ map: naver.maps.Map | null }>();
  return <p role="status">{map ? '지도 준비 완료' : '지도 준비 중'}</p>;
};

const renderSetup = (setupView?: ParkingSetupView, initialDestination = destination) =>
  renderWithProviders(
    <Routes>
      <Route element={<MapLayout />}>
        <Route path="/origin" element={<h1>처음 화면</h1>} />
        <Route path="/parkingsetup" element={<ParkingSetupPage />} />
        <Route path="/parkingRecommend" element={<ParkingRecommendPage />} />
      </Route>
    </Routes>,
    {
      initialEntries: [
        '/origin',
        {
          pathname: '/parkingsetup',
          state: { destination: initialDestination, setupView },
        },
      ],
    },
  );

describe('페이지가 담당하는 목적지 좌표 복원', () => {
  it('공통 레이아웃은 셋업 경로의 상태를 해석하지 않고 기본 지도를 생성한다', async () => {
    renderWithProviders(
      <Routes>
        <Route element={<MapLayout />}>
          <Route path="/parkingsetup" element={<MapReadyProbe />} />
        </Route>
      </Routes>,
      {
        initialEntries: [
          { pathname: '/parkingsetup', state: { destination, setupView: savedView } },
        ],
      },
    );

    await screen.findByText('지도 준비 완료');

    expect(mockMap.map.getCenter()).toEqual(new MockLatLng(37.4981, 127.0279));
    expect(mockMap.setCenter).not.toHaveBeenCalled();
  });

  it('검색 후 첫 진입에서는 셋업 페이지가 검색 좌표를 지도에 반영한다', async () => {
    const searchedDestination = { ...destination, latitude: 37.52, longitude: 127.05 };
    renderSetup(undefined, searchedDestination);

    await waitFor(() => {
      expect(mockMap.map.getCenter()).toEqual(
        new MockLatLng(searchedDestination.latitude, searchedDestination.longitude),
      );
    });
    expect(createNaverMap).toHaveBeenCalledTimes(1);
  });

  it('추천 요청이 실패해도 이전 화면의 이동한 목적지가 유지된다', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(
      http.get('/api/parking/search', () =>
        HttpResponse.json({ message: '추천 요청 실패' }, { status: 500 }),
      ),
    );

    renderSetup(savedView);
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: movedName });
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByRole('alert');

    mockMap.moveCenter(37.6, 127.1);
    await user.click(screen.getByRole('button', { name: '이전 화면으로 이동' }));

    expect(await screen.findByRole('heading', { name: movedName })).toBeInTheDocument();
    expect(mockMap.setCenter).toHaveBeenLastCalledWith(
      new MockLatLng(movedLocation.latitude, movedLocation.longitude),
    );
    expect(createNaverMap).toHaveBeenCalledTimes(1);
  });

  it('드래그로 저장한 좌표는 추천에서 돌아온 뒤에도 같은 지도에 복원된다', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(
      http.get('/api/parking/search', () =>
        HttpResponse.json({ message: '추천 요청 실패' }, { status: 500 }),
      ),
    );
    renderSetup();
    const user = userEvent.setup();
    await waitFor(() => expect(dragEndListeners.size).toBe(1));

    act(() => {
      mockMap.moveCenter(movedLocation.latitude, movedLocation.longitude);
      [...dragEndListeners].forEach((listener) => listener());
    });

    await screen.findByRole('heading', { name: movedName });
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByRole('alert');

    mockMap.moveCenter(37.6, 127.1);
    await user.click(screen.getByRole('button', { name: '이전 화면으로 이동' }));

    expect(await screen.findByRole('heading', { name: movedName })).toBeInTheDocument();
    expect(mockMap.map.getCenter()).toEqual(
      new MockLatLng(movedLocation.latitude, movedLocation.longitude),
    );
    expect(createNaverMap).toHaveBeenCalledTimes(1);
  });
});
