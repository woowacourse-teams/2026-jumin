import { jest } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router';

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
    } as unknown as naver.maps.Map,
    setCenter,
    moveCenter(latitude: number, longitude: number) {
      center = new MockLatLng(latitude, longitude);
    },
  };
};

let mockMap: ReturnType<typeof createMockMap>;
let originalNaver: PropertyDescriptor | undefined;

beforeEach(() => {
  mockMap = createMockMap();
  originalNaver = Object.getOwnPropertyDescriptor(globalThis, 'naver');

  Object.defineProperty(globalThis, 'naver', {
    configurable: true,
    value: {
      maps: {
        LatLng: MockLatLng,
        Event: {
          addListener: (_target: unknown, _eventName: string, listener: () => void) => listener,
          removeListener: jest.fn(),
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

const TestSetupLayout = () => {
  const { pathname } = useLocation();
  const [mapReady] = useState(true);

  return (
    <Outlet
      context={{
        map: pathname === '/parkingsetup' && mapReady ? mockMap.map : null,
      }}
    />
  );
};

const renderSetup = (setupView: ParkingSetupView) =>
  renderWithProviders(
    <Routes>
      <Route element={<TestSetupLayout />}>
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
          state: { destination, setupView },
        },
      ],
    },
  );

describe('추천 요청 실패 후 주차 위치 복원', () => {
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
  });
});
