import { jest } from '@jest/globals';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';

import type { ParkingSetupView, RecommendView } from '../../shared/types/navigation';
import { ParkingRecommendPage } from '../../src/pages/ParkingRecommendPage/ParkingRecommendPage';
import { ParkingSetupPage } from '../../src/pages/ParkingSetupPage/ParkingSetupPage';
import { server } from '../msw/server';
import { renderWithProviders } from '../renderWithProviders';
import { destination } from '../testData';

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
const nextDestination = {
  ...destination,
  destinationId: 'next-destination',
  name: '새로 검색한 목적지',
  latitude: 37.53,
  longitude: 127.06,
};

const createMockMap = () => {
  let center = new MockLatLng(0, 0);
  const listeners = new Set<() => void>();
  const setCenter = jest.fn((point: MockLatLng) => {
    center = point;
  });
  const panTo = jest.fn();

  return {
    map: {
      getCenter: () => center,
      setCenter,
      panTo,
      setOptions: jest.fn(),
    } as unknown as naver.maps.Map,
    setCenter,
    panTo,
    listeners,
    moveCenter(latitude: number, longitude: number) {
      center = new MockLatLng(latitude, longitude);
    },
    dragTo(latitude: number, longitude: number) {
      center = new MockLatLng(latitude, longitude);
      act(() => {
        [...listeners].forEach((listener) => listener());
      });
    },
  };
};

let mockMap: ReturnType<typeof createMockMap>;
let originalNaver: PropertyDescriptor | undefined;
const reverseGeocode = jest.fn<(latitude: string | null, longitude: string | null) => void>();
const parkingSearch = jest.fn<(params: URLSearchParams) => void>();

beforeEach(() => {
  mockMap = createMockMap();
  originalNaver = Object.getOwnPropertyDescriptor(globalThis, 'naver');
  Object.defineProperty(globalThis, 'naver', {
    configurable: true,
    value: {
      maps: {
        LatLng: MockLatLng,
        Event: {
          addListener: (_target: unknown, _eventName: string, listener: () => void) => {
            mockMap.listeners.add(listener);
            return listener;
          },
          removeListener: (listener: () => void) => mockMap.listeners.delete(listener),
        },
      },
    },
  });

  server.use(
    http.get('/api/destinations/reverse-geocode', ({ request }) => {
      const params = new URL(request.url).searchParams;
      reverseGeocode(params.get('latitude'), params.get('longitude'));
      return HttpResponse.json({ displayName: movedName });
    }),
    http.get('/api/parking/search', ({ request }) => {
      parkingSearch(new URL(request.url).searchParams);
      return HttpResponse.json({ searchRadiusMeters: 600, totalCount: 0, parkingLots: [] });
    }),
  );
});

afterEach(() => {
  if (originalNaver) {
    Object.defineProperty(globalThis, 'naver', originalNaver);
  } else {
    Reflect.deleteProperty(globalThis, 'naver');
  }
});

const TestSetupLayout = ({ initialMapReady }: { initialMapReady: boolean }) => {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const [mapReady, setMapReady] = useState(initialMapReady);
  const [recommendView, setRecommendView] = useState<RecommendView | null>(null);

  return (
    <>
      <output aria-label="현재 페이지 상태">{JSON.stringify(state)}</output>
      <button type="button" onClick={() => navigate(-1)}>
        테스트 이전 화면
      </button>
      <button type="button" onClick={() => setMapReady(true)}>
        테스트 지도 준비
      </button>
      <Outlet
        context={{
          // 추천 화면의 SDK 동작은 제외하고 실제 추천 요청과 뒤로가기를 확인한다.
          map: pathname === '/parkingsetup' && mapReady ? mockMap.map : null,
          recommendView,
          setRecommendView,
        }}
      />
    </>
  );
};

const SearchProbe = () => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate('/parkingsetup', { state: { destination: nextDestination } })}
    >
      새 목적지 선택
    </button>
  );
};

const renderSetup = (setupView?: ParkingSetupView, initialMapReady = true) =>
  renderWithProviders(
    <Routes>
      <Route element={<TestSetupLayout initialMapReady={initialMapReady} />}>
        <Route path="/origin" element={<h1>처음 화면</h1>} />
        <Route path="/search" element={<SearchProbe />} />
        <Route path="/parkingsetup" element={<ParkingSetupPage />} />
        <Route path="/parkingRecommend" element={<ParkingRecommendPage />} />
      </Route>
    </Routes>,
    {
      initialEntries: [
        '/origin',
        {
          pathname: '/parkingsetup',
          state: { destination, setupView, preservedValue: '기존 상태' },
        },
      ],
    },
  );

const getPageState = () =>
  JSON.parse(screen.getByLabelText('현재 페이지 상태').textContent!) as {
    destination: typeof destination;
    setupView?: ParkingSetupView;
    preservedValue?: string;
  };

describe('QA9. 목적지 위치 복원', () => {
  it('복원값 없이 진입하면 검색 좌표와 주소를 사용한다', () => {
    renderSetup();

    expect(mockMap.setCenter).toHaveBeenCalledWith(
      new MockLatLng(destination.latitude, destination.longitude),
    );
    expect(mockMap.panTo).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: destination.name })).toBeInTheDocument();
    expect(screen.getByText(destination.roadAddress!)).toBeInTheDocument();
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it('드래그 좌표를 기존 상태와 함께 저장하고 히스토리 항목은 추가하지 않는다', async () => {
    renderSetup();
    const user = userEvent.setup();

    mockMap.dragTo(37.505, 127.035);
    mockMap.dragTo(movedLocation.latitude, movedLocation.longitude);

    expect(await screen.findByRole('heading', { name: movedName })).toBeInTheDocument();
    expect(getPageState()).toEqual({
      destination,
      setupView: savedView,
      preservedValue: '기존 상태',
    });
    expect(screen.queryByText(destination.roadAddress!)).not.toBeInTheDocument();
    expect(mockMap.setCenter).toHaveBeenCalledTimes(1);
    expect(mockMap.listeners.size).toBe(1);

    await user.click(screen.getByRole('button', { name: '테스트 이전 화면' }));

    expect(screen.getByRole('heading', { name: '처음 화면' })).toBeInTheDocument();
    expect(mockMap.listeners.size).toBe(0);
  });

  it('빈 추천 결과에서 돌아오면 이동한 좌표와 이름을 복원하고 다시 추천할 수 있다', async () => {
    renderSetup();
    const user = userEvent.setup();
    mockMap.dragTo(movedLocation.latitude, movedLocation.longitude);
    await screen.findByRole('heading', { name: movedName });

    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('추천할 수 있는 주차장이 없습니다.');

    expect(parkingSearch.mock.calls[0]![0].get('destinationLatitude')).toBe('37.51');
    expect(parkingSearch.mock.calls[0]![0].get('destinationLongitude')).toBe('127.04');
    expect(mockMap.listeners.size).toBe(0);

    // 다른 화면에서 지도 중심이 변경돼도 저장한 목적지를 기준으로 복원한다.
    mockMap.moveCenter(37.6, 127.1);
    await user.click(screen.getByRole('button', { name: '이전 화면으로 이동' }));

    expect(await screen.findByRole('heading', { name: movedName })).toBeInTheDocument();
    expect(mockMap.setCenter).toHaveBeenLastCalledWith(
      new MockLatLng(movedLocation.latitude, movedLocation.longitude),
    );
    expect(mockMap.panTo).not.toHaveBeenCalled();
    expect(reverseGeocode).toHaveBeenLastCalledWith('37.51', '127.04');
    expect(getPageState().setupView).toEqual(savedView);

    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('추천할 수 있는 주차장이 없습니다.');
    await user.click(screen.getByRole('button', { name: '이전 화면으로 이동' }));

    expect(await screen.findByRole('heading', { name: movedName })).toBeInTheDocument();
    expect(getPageState().setupView).toEqual(savedView);
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
  });

  it('지도가 늦게 준비되어도 저장된 좌표로 이동한다', async () => {
    renderSetup(savedView, false);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: movedName });
    expect(mockMap.setCenter).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '테스트 지도 준비' }));

    expect(mockMap.setCenter).toHaveBeenCalledWith(
      new MockLatLng(movedLocation.latitude, movedLocation.longitude),
    );
  });

  it('새 목적지를 선택하면 이전 화면에 저장한 좌표를 적용하지 않는다', async () => {
    renderSetup(savedView);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: movedName });

    await user.click(screen.getByRole('button', { name: '목적지 선택 취소' }));
    await user.click(screen.getByRole('button', { name: '새 목적지 선택' }));

    expect(screen.getByRole('heading', { name: nextDestination.name })).toBeInTheDocument();
    expect(getPageState().setupView).toBeUndefined();
    await waitFor(() =>
      expect(mockMap.setCenter).toHaveBeenLastCalledWith(
        new MockLatLng(nextDestination.latitude, nextDestination.longitude),
      ),
    );
  });
});
