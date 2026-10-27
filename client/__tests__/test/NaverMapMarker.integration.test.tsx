import { jest } from '@jest/globals';
import { cleanup, render } from '@testing-library/react';

import { NaverMapMarker } from '../../shared/maps/NaverMapMarker';

class MockPoint {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

const createMarker = () => ({
  setIcon: jest.fn<(icon: naver.maps.ImageIcon) => void>(),
  setOptions: jest.fn<(key: string, value: unknown) => void>(),
  setMap: jest.fn<(map: naver.maps.Map | null) => void>(),
});

const Marker =
  jest.fn<(options: naver.maps.MarkerOptions) => ReturnType<typeof createMarker>>(createMarker);
const addListener = jest.fn((_marker: unknown, _event: string, listener: () => void) => listener);
const removeListener = jest.fn();
const map = {} as naver.maps.Map;
const icon = { url: 'home.svg', width: 25, height: 25, anchorX: 12.5, anchorY: 25 };
const selectedIcon = { url: 'selected.svg', width: 30, height: 33, anchorX: 15, anchorY: 33 };
const props = { map, latitude: 37.5, longitude: 127, icon, title: '주차장', zIndex: 10 };

let originalNaver: PropertyDescriptor | undefined;

beforeEach(() => {
  originalNaver = Object.getOwnPropertyDescriptor(globalThis, 'naver');
  Object.defineProperty(globalThis, 'naver', {
    configurable: true,
    value: {
      maps: {
        Marker,
        LatLng: MockPoint,
        Size: MockPoint,
        Point: MockPoint,
        Event: { addListener, removeListener },
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

// 마커와 리스너 재사용은 이번 최적화의 동작 계약이므로 SDK 생성 횟수를 검증한다.
it('아이콘과 z-index만 변경하면 기존 마커와 클릭 리스너를 유지한다', () => {
  const onClick = jest.fn();
  const nextOnClick = jest.fn();
  const { rerender, unmount } = render(<NaverMapMarker {...props} onClick={onClick} />);
  const marker = Marker.mock.results[0]!.value as ReturnType<typeof createMarker>;

  rerender(<NaverMapMarker {...props} icon={selectedIcon} onClick={onClick} />);
  expect(marker.setIcon).toHaveBeenLastCalledWith(
    expect.objectContaining({ url: selectedIcon.url }),
  );

  rerender(<NaverMapMarker {...props} icon={selectedIcon} zIndex={20} onClick={nextOnClick} />);
  expect(marker.setOptions).toHaveBeenLastCalledWith('zIndex', 20);
  expect(marker.setIcon).toHaveBeenCalledTimes(1);
  expect(Marker).toHaveBeenCalledTimes(1);
  expect(addListener).toHaveBeenCalledTimes(1);
  expect(removeListener).not.toHaveBeenCalled();
  expect(marker.setMap).not.toHaveBeenCalled();

  addListener.mock.calls[0]![2]();
  expect(onClick).not.toHaveBeenCalled();
  expect(nextOnClick).toHaveBeenCalledTimes(1);

  unmount();
  expect(removeListener).toHaveBeenCalledTimes(1);
  expect(removeListener).toHaveBeenCalledWith(addListener.mock.results[0]!.value);
  expect(marker.setMap).toHaveBeenCalledTimes(1);
  expect(marker.setMap).toHaveBeenCalledWith(null);
});

it('지도가 준비되면 최신 아이콘과 z-index로 생성한다', () => {
  const onClick = jest.fn();
  const { rerender } = render(<NaverMapMarker {...props} map={null} onClick={onClick} />);
  expect(Marker).not.toHaveBeenCalled();

  rerender(<NaverMapMarker {...props} icon={selectedIcon} zIndex={20} onClick={onClick} />);
  expect(Marker).toHaveBeenLastCalledWith(
    expect.objectContaining({
      icon: expect.objectContaining({ url: selectedIcon.url }),
      zIndex: 20,
    }),
  );
  expect(Marker).toHaveBeenCalledTimes(1);
});

it.each([
  { latitude: 37.6, longitude: props.longitude },
  { latitude: props.latitude, longitude: 127.1 },
])('좌표만 $latitude, $longitude로 바꾸면 기존 마커를 정리하고 위치를 반영한다', (position) => {
  const onClick = jest.fn();
  const { rerender } = render(<NaverMapMarker {...props} onClick={onClick} />);
  const firstMarker = Marker.mock.results[0]!.value as ReturnType<typeof createMarker>;

  rerender(<NaverMapMarker {...props} {...position} onClick={onClick} />);
  expect(firstMarker.setMap).toHaveBeenCalledTimes(1);
  expect(firstMarker.setMap).toHaveBeenCalledWith(null);
  expect(removeListener).toHaveBeenCalledTimes(1);
  expect(Marker).toHaveBeenCalledTimes(2);
  expect(Marker).toHaveBeenLastCalledWith(
    expect.objectContaining({
      position: new MockPoint(position.latitude, position.longitude),
    }),
  );
  expect(addListener).toHaveBeenCalledTimes(2);
});

it('onClick만 추가하거나 제거하면 클릭 가능 여부와 리스너를 갱신한다', () => {
  const onClick = jest.fn();
  const { rerender } = render(<NaverMapMarker {...props} />);
  const firstMarker = Marker.mock.results[0]!.value as ReturnType<typeof createMarker>;
  expect(addListener).not.toHaveBeenCalled();

  rerender(<NaverMapMarker {...props} onClick={onClick} />);
  expect(firstMarker.setMap).toHaveBeenCalledWith(null);
  expect(Marker).toHaveBeenCalledTimes(2);
  expect(Marker).toHaveBeenLastCalledWith(expect.objectContaining({ clickable: true }));
  expect(addListener).toHaveBeenCalledTimes(1);
  addListener.mock.calls[0]![2]();
  expect(onClick).toHaveBeenCalledTimes(1);
  const clickableMarker = Marker.mock.results[1]!.value as ReturnType<typeof createMarker>;

  rerender(<NaverMapMarker {...props} />);
  expect(clickableMarker.setMap).toHaveBeenCalledWith(null);
  expect(removeListener).toHaveBeenCalledWith(addListener.mock.results[0]!.value);
  expect(Marker).toHaveBeenCalledTimes(3);
  expect(Marker).toHaveBeenLastCalledWith(expect.objectContaining({ clickable: false }));
  expect(addListener).toHaveBeenCalledTimes(1);
});

it('동시에 바뀐 아이콘과 생략된 z-index도 재생성 없이 반영한다', () => {
  const { rerender } = render(<NaverMapMarker {...props} />);
  const marker = Marker.mock.results[0]!.value as ReturnType<typeof createMarker>;

  rerender(<NaverMapMarker {...props} icon={selectedIcon} zIndex={undefined} />);
  expect(Marker).toHaveBeenCalledTimes(1);
  expect(marker.setIcon).toHaveBeenCalledTimes(1);
  expect(marker.setOptions).toHaveBeenLastCalledWith('zIndex', undefined);
  expect(addListener).not.toHaveBeenCalled();
});
