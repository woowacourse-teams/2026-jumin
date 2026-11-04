import { jest } from '@jest/globals';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';

import { MapLayout } from '../../src/shared/maps/MapLayout';
import { NaverMap } from '../../src/shared/maps/NaverMap';
import { renderWithProviders } from '../renderWithProviders';

// 실제 타일 대신 SDK 생성 옵션과 객체 정리 여부만 확인할 수 있는 대역을 사용한다.
class MockLatLng {
  constructor(
    public latitude: number,
    public longitude: number,
  ) {}
}

class MockMap {
  destroy = jest.fn();

  constructor(public options: naver.maps.MapOptions) {}
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
const destination = { latitude: 37.5547, longitude: 126.9707 };
const defaultCenter = { latitude: 37.4981, longitude: 127.0279 };

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
    url: `/parkingsetup?lat=${destination.latitude}&lng=${destination.longitude}`,
    center: destination,
  },
  { label: '홈의 기본 좌표', url: '/', center: defaultCenter },
  {
    label: '경도가 누락된 URL의 기본 좌표',
    url: `/parkingsetup?lat=${destination.latitude}`,
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
    expect.objectContaining({ center: new MockLatLng(center.latitude, center.longitude) }),
  );
});

it('좌표와 줌 props가 바뀌어도 같은 지도를 유지하고 제거할 때 정리한다', async () => {
  // 콜백 참조는 유지해서 좌표와 줌 변경이 지도 생명주기에 미치는 영향만 확인한다.
  const onMapReady = jest.fn<(map: naver.maps.Map | null) => void>();
  const { rerender, unmount } = render(
    <NaverMap {...destination} zoom={16} onMapReady={onMapReady} />,
  );

  await waitFor(() => expect(onMapReady).toHaveBeenCalledTimes(1));
  const map = createMap.mock.results[0]!.value as MockMap;
  expect(map.options.zoom).toBe(16);

  // 잘못된 재생성이 있으면 비동기 지도 생성까지 끝난 뒤 횟수에 드러나도록 기다린다.
  await act(async () => {
    rerender(<NaverMap latitude={37.56} longitude={126.98} zoom={17} onMapReady={onMapReady} />);
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
  const { unmount } = render(<NaverMap {...destination} onMapReady={onMapReady} />);
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
