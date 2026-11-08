import { jest } from '@jest/globals';
import { act, cleanup, renderHook } from '@testing-library/react';

import { useParkingSetupMap } from '../../src/pages/ParkingSetupPage/hooks/useParkingSetupMap';

// SDK의 옵션과 이벤트를 대체해 드래그·관성 이동 완료 계약을 검증한다.
// 실제 관성 애니메이션 대신 dragstart → dragend → idle을 순서대로 발생시킨다.
const createMap = (initialOrigin: object | null = null) => {
  const element = document.createElement('div');
  const dragEvents = new EventTarget();
  let center = { lat: () => 37.57, lng: () => 126.99 };
  const options = { zoomOrigin: initialOrigin, disableKineticPan: true };

  const map = {
    getElement: () => element,
    getCenter: () => center,
    getOptions: (name: keyof typeof options) => options[name],
    setOptions: jest.fn((name: string, value: object | boolean | null) => {
      if (name === 'zoomOrigin') options.zoomOrigin = value as object | null;
      if (name === 'disableKineticPan') options.disableKineticPan = value as boolean;
    }),
  };

  return {
    map: map as unknown as naver.maps.Map,
    element,
    dragEvents,
    getOrigin: () => options.zoomOrigin,
    isKineticPanDisabled: () => options.disableKineticPan,
    moveTo: (latitude: number, longitude: number) => {
      center = { lat: () => latitude, lng: () => longitude };
    },
  };
};

type MapDouble = ReturnType<typeof createMap>;
let originalNaver: PropertyDescriptor | undefined;
let maps: MapDouble[];

beforeEach(() => {
  maps = [];
  originalNaver = Object.getOwnPropertyDescriptor(globalThis, 'naver');
  Object.defineProperty(globalThis, 'naver', {
    configurable: true,
    value: {
      maps: {
        Event: {
          addListener: (map: naver.maps.Map, name: string, callback: EventListener) => {
            const target = maps.find((candidate) => candidate.map === map)!.dragEvents;
            target.addEventListener(name, callback);
            return { target, name, callback };
          },
          removeListener: (listener: {
            target: EventTarget;
            name: string;
            callback: EventListener;
          }) => {
            listener.target.removeEventListener(listener.name, listener.callback);
          },
        },
      },
    },
  });
});

afterEach(() => {
  // 훅의 SDK 이벤트 정리가 끝난 다음 전역을 돌려놓는다.
  cleanup();
  if (originalNaver) Object.defineProperty(globalThis, 'naver', originalNaver);
  else Reflect.deleteProperty(globalThis, 'naver');
});

const prepareMap = (initialOrigin: object | null = null) => {
  const map = createMap(initialOrigin);
  maps.push(map);
  return map;
};

it('지도가 늦게 준비되어도 실제 중심을 확대·축소 기준으로 설정한다', () => {
  const onLocationSettled = jest.fn();
  const { rerender } = renderHook(
    ({ map }: { map: naver.maps.Map | null }) => useParkingSetupMap({ map, onLocationSettled }),
    { initialProps: { map: null as naver.maps.Map | null } },
  );
  const setup = prepareMap();
  setup.moveTo(37.58, 127.01);

  // 지도 준비 전에는 대기하고, 준비된 시점의 중심을 사용한다.
  rerender({ map: setup.map });
  expect(setup.getOrigin()).toBe(setup.map.getCenter());
  expect(onLocationSettled).not.toHaveBeenCalled();
});

it('드래그와 관성 이동 중에는 대기하고 idle에서 최종 좌표를 한 번 전달한다', () => {
  const setup = prepareMap();
  const onLocationSettled = jest.fn();
  const { result } = renderHook(() => useParkingSetupMap({ map: setup.map, onLocationSettled }));

  // 손을 뗀 좌표는 아직 확정하지 않고 관성 이동 중에도 대기 상태를 유지한다.
  act(() => setup.dragEvents.dispatchEvent(new Event('dragstart')));
  expect(result.current.isDragging).toBe(true);
  setup.moveTo(37.58, 127.01);
  act(() => setup.dragEvents.dispatchEvent(new Event('dragend')));
  expect(onLocationSettled).not.toHaveBeenCalled();
  expect(result.current.isDragging).toBe(true);

  // 관성으로 더 이동한 뒤 정지했을 때 최종 중심을 전달하고 대기를 해제한다.
  setup.moveTo(37.59, 127.02);
  act(() => setup.dragEvents.dispatchEvent(new Event('idle')));
  expect(setup.getOrigin()).toBe(setup.map.getCenter());
  expect(onLocationSettled).toHaveBeenCalledTimes(1);
  expect(onLocationSettled).toHaveBeenCalledWith({ latitude: 37.59, longitude: 127.02 });
  expect(result.current.isDragging).toBe(false);

  act(() => setup.dragEvents.dispatchEvent(new Event('idle')));
  expect(onLocationSettled).toHaveBeenCalledTimes(1);
});

it('매 휠 입력에서 최신 중심을 기준으로 갱신하고 기본 휠 동작을 막지 않는다', () => {
  const setup = prepareMap();
  const onLocationSettled = jest.fn();
  const nativeWheel = jest.fn();
  // SDK의 버블 단계 휠 리스너가 읽는 기준점을 관찰한다. 실제 줌은 재현하지 않는다.
  setup.element.addEventListener('wheel', (event) => {
    nativeWheel(setup.getOrigin(), event.defaultPrevented);
  });
  renderHook(() => useParkingSetupMap({ map: setup.map, onLocationSettled }));

  // URL이나 부모 props가 바뀌지 않아도 확대·축소 방향마다 현재 SDK 중심을 사용한다.
  for (const [latitude, longitude, deltaY] of [
    [37.58, 127.01, -100],
    [37.59, 127.02, 100],
  ] as const) {
    setup.moveTo(latitude, longitude);
    const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
    act(() => setup.element.dispatchEvent(event));

    expect(nativeWheel).toHaveBeenLastCalledWith(setup.map.getCenter(), false);
    expect(event.defaultPrevented).toBe(false);
  }
  // 휠 조작 뒤에도 idle은 발생하지만 드래그한 적이 없으면 목적지를 저장하지 않는다.
  act(() => setup.dragEvents.dispatchEvent(new Event('idle')));
  expect(nativeWheel).toHaveBeenCalledTimes(2);
  expect(onLocationSettled).not.toHaveBeenCalled();
});

it.each([null, { lat: () => 37.5, lng: () => 127 }])(
  '셋업을 벗어나면 기존 기준점 %p를 복구하고 휠·드래그 처리를 해제한다',
  (previousOrigin) => {
    const setup = prepareMap(previousOrigin);
    const onLocationSettled = jest.fn();
    const { unmount } = renderHook(() => useParkingSetupMap({ map: setup.map, onLocationSettled }));
    expect(setup.isKineticPanDisabled()).toBe(false);

    act(() => setup.dragEvents.dispatchEvent(new Event('dragstart')));
    unmount();
    expect(setup.getOrigin()).toBe(previousOrigin);
    expect(setup.isKineticPanDisabled()).toBe(true);

    // 공유 지도에서 이후 입력을 받아도 제거된 셋업의 핸들러가 동작하면 안 된다.
    setup.moveTo(37.59, 127.02);
    act(() => {
      setup.element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
      setup.dragEvents.dispatchEvent(new Event('dragstart'));
      setup.dragEvents.dispatchEvent(new Event('idle'));
    });
    expect(setup.getOrigin()).toBe(previousOrigin);
    expect(onLocationSettled).not.toHaveBeenCalled();
  },
);

it('지도 인스턴스가 바뀌면 이전 지도를 정리하고 새 지도의 중심을 사용한다', () => {
  const previousOrigin = {};
  const first = prepareMap(previousOrigin);
  const second = prepareMap();
  const onLocationSettled = jest.fn();
  const { rerender } = renderHook(({ map }) => useParkingSetupMap({ map, onLocationSettled }), {
    initialProps: { map: first.map },
  });

  rerender({ map: second.map });
  expect(first.getOrigin()).toBe(previousOrigin);
  expect(first.isKineticPanDisabled()).toBe(true);
  expect(second.getOrigin()).toBe(second.map.getCenter());

  // 이전 인스턴스에서는 콜백이 해제되고 새 인스턴스에서만 선택 좌표를 전달한다.
  act(() => {
    first.dragEvents.dispatchEvent(new Event('dragstart'));
    first.dragEvents.dispatchEvent(new Event('idle'));
    second.moveTo(37.59, 127.02);
    second.dragEvents.dispatchEvent(new Event('dragstart'));
  });
  act(() => second.dragEvents.dispatchEvent(new Event('idle')));
  expect(onLocationSettled).toHaveBeenCalledTimes(1);
  expect(onLocationSettled).toHaveBeenCalledWith({ latitude: 37.59, longitude: 127.02 });
});
