import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { lazy, type ComponentType } from 'react';
import { Link, Route, Routes } from 'react-router';

import { MapLayout } from '../../src/shared/maps/MapLayout';
import { NaverMap } from '../../src/shared/maps/NaverMap';
import { renderWithProviders } from '../renderWithProviders';

// 실제 타일 대신 SDK 생성 옵션과 객체 정리 여부만 확인할 수 있는 대역을 사용한다.
class MockLatLng {
  constructor(
    public initialLatitude: number,
    public longitude: number,
  ) {}

  lat() {
    return this.initialLatitude;
  }

  lng() {
    return this.longitude;
  }
}

class MockMap {
  private center: MockLatLng;
  destroy = jest.fn();
  getCenter = () => this.center;
  setCenter = jest.fn((center: MockLatLng) => {
    this.center = center;
  });

  constructor(public options: naver.maps.MapOptions) {
    this.center = options.center as unknown as MockLatLng;
  }
}

const createMap = jest.fn(
  (_element: HTMLElement, options: naver.maps.MapOptions) => new MockMap(options),
);
const mockSdk = {
  maps: {
    Map: createMap,
    LatLng: MockLatLng,
    LatLngBounds: class {},
  },
};
// 강남역과 다른 서울역 좌표를 사용해야 기본 좌표로 잘못 생성하는 회귀를 잡을 수 있다.
const destination = { initialLatitude: 37.5547, longitude: 126.9707 };
const defaultCenter = { initialLatitude: 37.4981, longitude: 127.0279 };

let originalNaver: PropertyDescriptor | undefined;
let originalClientId: PropertyDescriptor | undefined;

beforeEach(() => {
  originalNaver = Object.getOwnPropertyDescriptor(globalThis, 'naver');
  originalClientId = Object.getOwnPropertyDescriptor(globalThis, '__NAVER_MAP_CLIENT_ID__');
  // 기본 시나리오는 SDK가 이미 준비된 상태이며, 로딩 지연은 마지막 테스트에서 따로 재현한다.
  Object.defineProperty(globalThis, 'naver', { configurable: true, value: mockSdk });
  Object.defineProperty(globalThis, '__NAVER_MAP_CLIENT_ID__', {
    configurable: true,
    value: 'test-client-id',
  });
});

afterEach(() => {
  // 컴포넌트의 정리를 먼저 끝내고 전역 SDK를 복원해 다른 테스트에 영향을 남기지 않는다.
  cleanup();

  if (originalNaver) Object.defineProperty(globalThis, 'naver', originalNaver);
  else Reflect.deleteProperty(globalThis, 'naver');

  if (originalClientId) {
    Object.defineProperty(globalThis, '__NAVER_MAP_CLIENT_ID__', originalClientId);
  } else {
    Reflect.deleteProperty(globalThis, '__NAVER_MAP_CLIENT_ID__');
  }
});

// 나중에 목적지로 이동했는지가 아니라 처음부터 올바른 좌표로 생성했는지를 검증한다.
it.each([
  {
    label: '설정 화면의 목적지 좌표',
    url: `/parkingsetup?lat=${destination.initialLatitude}&lng=${destination.longitude}`,
    center: destination,
  },
  { label: '홈의 기본 좌표', url: '/', center: defaultCenter },
  {
    label: '경도가 누락된 URL의 기본 좌표',
    url: `/parkingsetup?lat=${destination.initialLatitude}`,
    center: defaultCenter,
  },
  {
    label: '유효하지 않은 URL의 기본 좌표',
    url: '/parkingsetup?lat=Infinity&lng=127',
    center: defaultCenter,
  },
])('$label로 처음부터 지도를 생성한다', async ({ url, center }) => {
  // 하위 화면의 setCenter 보정이 초기화 오류를 가리지 않도록 공통 지도 레이아웃만 연결한다.
  renderWithProviders(
    <Routes>
      <Route element={<MapLayout />}>
        <Route path="*" element={null} />
      </Route>
    </Routes>,
    { initialEntries: [url] },
  );

  await waitFor(() => expect(createMap).toHaveBeenCalledTimes(1));
  expect(createMap).toHaveBeenCalledWith(
    expect.any(HTMLElement),
    expect.objectContaining({ center: new MockLatLng(center.initialLatitude, center.longitude) }),
  );
});

it.each(['/parkingsetup', '/parkingsetup/', '/ParkingSetup'])(
  '검색에서 %s 코드의 로딩을 기다리는 동안에도 기존 지도를 새 목적지로 이동한다',
  async (setupPath) => {
    // 설정 페이지의 코드를 직접 대기시켜 그 안의 effect가 좌표를 보정할 수 없는 상황을 만든다.
    let completeSetup!: (module: { default: ComponentType }) => void;
    const setupModule = new Promise<{ default: ComponentType }>((resolve) => {
      completeSetup = resolve;
    });
    const SetupPage = lazy(() => setupModule);

    renderWithProviders(
      <Routes>
        <Route element={<MapLayout />}>
          <Route
            path="/"
            element={<Link to="/search?lat=37.4981&lng=127.0279">목적지 검색</Link>}
          />
          <Route
            path="/search"
            element={
              <Link
                to={`${setupPath}?lat=${destination.initialLatitude}&lng=${destination.longitude}`}
              >
                서울역 선택
              </Link>
            }
          />
          <Route path="/parkingsetup" element={<SetupPage />} />
        </Route>
      </Routes>,
    );

    await waitFor(() => expect(createMap).toHaveBeenCalledTimes(1));
    const map = createMap.mock.results[0]!.value as MockMap;
    expect(map.getCenter()).toEqual(
      new MockLatLng(defaultCenter.initialLatitude, defaultCenter.longitude),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: '목적지 검색' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: '서울역 선택' }));
    });

    // 코드 로딩 완료 전에 중심을 검증해 페이지가 뜬 뒤의 보정만으로 테스트가 통과하지 않게 한다.
    expect(screen.queryByRole('heading', { name: '목적지 설정' })).not.toBeInTheDocument();
    expect(map.getCenter()).toEqual(
      new MockLatLng(destination.initialLatitude, destination.longitude),
    );
    expect(createMap).toHaveBeenCalledTimes(1);
    expect(map.destroy).not.toHaveBeenCalled();

    await act(async () => {
      completeSetup({ default: () => <h1>목적지 설정</h1> });
    });
    expect(map.getCenter()).toEqual(
      new MockLatLng(destination.initialLatitude, destination.longitude),
    );
    expect(createMap).toHaveBeenCalledTimes(1);
  },
);

it.each([
  `/search?lat=${destination.initialLatitude}&lng=${destination.longitude}`,
  `/parkingRecommend?lat=${destination.initialLatitude}&lng=${destination.longitude}`,
  '/parkingsetup?lat=Infinity&lng=127',
])(
  '설정 화면이 아니거나 좌표가 잘못된 %s에서는 기존 카메라 위치를 변경하지 않는다',
  async (url) => {
    // 추천 화면 등에서 보정한 중심은 URL의 목적지와 달라도 공통 레이아웃이 덮어쓰면 안 된다.
    renderWithProviders(
      <>
        <Link to={url}>다음 화면으로 이동</Link>
        <Routes>
          <Route element={<MapLayout />}>
            <Route path="*" element={null} />
          </Route>
        </Routes>
      </>,
    );
    await waitFor(() => expect(createMap).toHaveBeenCalledTimes(1));
    const map = createMap.mock.results[0]!.value as MockMap;
    const adjustedCenter = new MockLatLng(37.52, 127.04);
    map.setCenter(adjustedCenter);
    map.setCenter.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: '다음 화면으로 이동' }));
    });

    expect(map.getCenter()).toEqual(adjustedCenter);
    expect(map.setCenter).not.toHaveBeenCalled();
    expect(createMap).toHaveBeenCalledTimes(1);
  },
);

it('검색 후 셋업 진입에서는 새 목적지로 이동하고 드래그 좌표 저장은 지도를 다시 움직이지 않는다', async () => {
  const changedCenter = new MockLatLng(37.56, 126.98);
  const draggedCenter = new MockLatLng(37.57, 126.99);
  renderWithProviders(
    <>
      <Link to="/search">새 목적지 검색</Link>
      <Link to="/parkingsetup?lat=37.57&lng=126.99">드래그 좌표 반영</Link>
      <Routes>
        <Route element={<MapLayout />}>
          <Route
            path="/search"
            element={<Link to="/parkingsetup?lat=37.56&lng=126.98">목적지 변경</Link>}
          />
          <Route path="/parkingsetup" element={null} />
        </Route>
      </Routes>
    </>,
    {
      initialEntries: [
        `/parkingsetup?lat=${destination.initialLatitude}&lng=${destination.longitude}`,
      ],
    },
  );
  await waitFor(() => expect(createMap).toHaveBeenCalledTimes(1));
  const map = createMap.mock.results[0]!.value as MockMap;
  expect(map.setCenter).not.toHaveBeenCalled();

  // 새 목적지 선택은 검색 페이지를 거쳐 셋업에 다시 진입하는 실제 흐름으로 확인한다.
  await act(async () => {
    fireEvent.click(screen.getByRole('link', { name: '새 목적지 검색' }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('link', { name: '목적지 변경' }));
  });
  expect(map.getCenter()).toEqual(changedCenter);
  expect(map.setCenter).toHaveBeenCalledTimes(1);

  // SDK에서 먼저 드래그한 뒤 URL이 갱신되는 순서를 재현해 중복 이동을 막는지 확인한다.
  map.setCenter(draggedCenter);
  map.setCenter.mockClear();
  await act(async () => {
    fireEvent.click(screen.getByRole('link', { name: '드래그 좌표 반영' }));
  });
  expect(map.getCenter()).toEqual(draggedCenter);
  expect(map.setCenter).not.toHaveBeenCalled();
  expect(createMap).toHaveBeenCalledTimes(1);
  expect(map.destroy).not.toHaveBeenCalled();
});

it('드래그 직후 줌으로 중심이 달라져도 늦게 반영된 URL이 지도를 덮어쓰지 않는다', async () => {
  const draggedCenter = new MockLatLng(37.57, 126.99);
  const zoomingCenter = new MockLatLng(37.571, 126.991);
  renderWithProviders(
    <>
      <Link replace to="/parkingsetup?lat=37.57&lng=126.99">
        드래그 좌표 저장
      </Link>
      <Link to="/parkingRecommend?lat=37.57&lng=126.99">추천 이동</Link>
      <Link to="/parkingsetup?lat=37.57&lng=126.99">셋업 복원</Link>
      <Routes>
        <Route element={<MapLayout />}>
          <Route path="*" element={null} />
        </Route>
      </Routes>
    </>,
    { initialEntries: ['/parkingsetup?lat=37.5547&lng=126.9707'] },
  );
  await waitFor(() => expect(createMap).toHaveBeenCalledTimes(1));
  const map = createMap.mock.results[0]!.value as MockMap;

  // SDK가 먼저 드래그하고, URL 렌더가 끝나기 전에 휠 줌으로 중심이 달라진 상황이다.
  // 줌 애니메이션 자체는 재현하지 않으며 URL 반영 시 불필요한 카메라 명령만 검증한다.
  map.setCenter(draggedCenter);
  await act(async () => {
    fireEvent.click(screen.getByRole('link', { name: '드래그 좌표 저장' }));
    map.setCenter(zoomingCenter);
    map.setCenter.mockClear();
  });

  expect(map.getCenter()).toEqual(zoomingCenter);
  expect(map.setCenter).not.toHaveBeenCalled();

  // 추천 화면에서 돌아오는 진입은 다시 URL의 선택 좌표로 정렬해야 한다.
  await act(async () => {
    fireEvent.click(screen.getByRole('link', { name: '추천 이동' }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('link', { name: '셋업 복원' }));
  });
  expect(map.getCenter()).toEqual(draggedCenter);
  expect(map.setCenter).toHaveBeenCalledTimes(1);
  expect(createMap).toHaveBeenCalledTimes(1);
});

it('지도 준비 전에 셋업으로 이동해도 준비가 끝나면 선택한 목적지로 정렬한다', async () => {
  renderWithProviders(
    <>
      <Link to="/parkingsetup?lat=37.57&lng=126.99">목적지 선택</Link>
      <Routes>
        <Route element={<MapLayout />}>
          <Route path="*" element={null} />
        </Route>
      </Routes>
    </>,
  );

  // 지도 생성 effect의 SDK 준비 await가 끝나기 전에 경로를 바꾼다.
  expect(createMap).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByRole('link', { name: '목적지 선택' }));
  });

  await waitFor(() => expect(createMap).toHaveBeenCalledTimes(1));
  const map = createMap.mock.results[0]!.value as MockMap;
  expect(map.getCenter()).toEqual(new MockLatLng(37.57, 126.99));
  expect(map.destroy).not.toHaveBeenCalled();
});

it('좌표와 줌 props가 바뀌어도 같은 지도를 유지하고 제거할 때 정리한다', async () => {
  // 콜백 참조는 유지해서 좌표와 줌 변경이 지도 생명주기에 미치는 영향만 확인한다.
  const onMapReady = jest.fn<(map: naver.maps.Map | null) => void>();
  const { rerender, unmount } = render(
    <NaverMap
      initialLatitude={destination.initialLatitude}
      initialLongitude={destination.longitude}
      initialZoom={16}
      onMapReady={onMapReady}
    />,
  );

  await waitFor(() => expect(onMapReady).toHaveBeenCalledTimes(1));
  const map = createMap.mock.results[0]!.value as MockMap;
  expect(map.options.zoom).toBe(16);

  // 잘못된 재생성이 있으면 비동기 지도 생성까지 끝난 뒤 횟수에 드러나도록 기다린다.
  await act(async () => {
    rerender(
      <NaverMap
        initialLatitude={37.56}
        initialLongitude={126.98}
        initialZoom={17}
        onMapReady={onMapReady}
      />,
    );
  });

  expect(createMap).toHaveBeenCalledTimes(1);
  expect(onMapReady).toHaveBeenCalledTimes(1);
  expect(onMapReady).toHaveBeenCalledWith(map);
  expect(map.destroy).not.toHaveBeenCalled();

  // props 갱신 때는 유지한 객체도 화면에서 제거할 때는 정리하고 부모에 null을 전달해야 한다.
  unmount();
  expect(map.destroy).toHaveBeenCalledTimes(1);
  expect(onMapReady).toHaveBeenLastCalledWith(null);
});

it('SDK 로딩 중 제거된 지도는 SDK가 준비돼도 뒤늦게 생성하지 않는다', async () => {
  // SDK가 없는 상태에서 시작해 스크립트 로딩을 기다리는 비동기 경로로 진입한다.
  Reflect.deleteProperty(globalThis, 'naver');
  const onMapReady = jest.fn<(map: naver.maps.Map | null) => void>();
  const { unmount } = render(
    <NaverMap
      initialLatitude={destination.initialLatitude}
      initialLongitude={destination.longitude}
      onMapReady={onMapReady}
    />,
  );
  // UI 구조가 아닌 외부 SDK 스크립트의 로딩 완료를 직접 제어한다.
  const script = Array.from(document.scripts).find(
    ({ src }) => new URL(src).hostname === 'oapi.map.naver.com',
  );

  try {
    expect(script).toBeDefined();
    expect(createMap).not.toHaveBeenCalled();
    // SDK 완료보다 화면 제거가 먼저 일어나는 순서로 취소 상황을 재현한다.
    unmount();

    await act(async () => {
      Object.defineProperty(globalThis, 'naver', { configurable: true, value: mockSdk });
      script!.dispatchEvent(new Event('load'));
    });

    // 로딩이 뒤늦게 완료돼도 지도 생성이나 준비 완료 알림 없이 제거 알림(null)만 남아야 한다.
    expect(createMap).not.toHaveBeenCalled();
    expect(onMapReady).toHaveBeenCalledTimes(1);
    expect(onMapReady).toHaveBeenCalledWith(null);
  } finally {
    script?.remove();
  }
});
