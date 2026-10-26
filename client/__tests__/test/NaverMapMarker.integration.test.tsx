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

it('아이콘과 z-index만 변경하면 기존 마커와 클릭 리스너를 유지한다', () => {
  const onClick = jest.fn();
  const nextOnClick = jest.fn();
  const { rerender, unmount } = render(<NaverMapMarker {...props} onClick={onClick} />);
  const marker = Marker.mock.results[0]!.value as ReturnType<typeof createMarker>;

  rerender(<NaverMapMarker {...props} icon={selectedIcon} onClick={onClick} />);
  expect(marker.setIcon).toHaveBeenLastCalledWith({
    url: selectedIcon.url,
    size: new MockPoint(30, 33),
    scaledSize: new MockPoint(30, 33),
    origin: new MockPoint(0, 0),
    anchor: new MockPoint(15, 33),
  });
  expect(marker.setOptions).not.toHaveBeenCalled();

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

it('지도가 준비될 때와 다른 생성 조건이 바뀔 때 최신 아이콘과 z-index로 생성한다', () => {
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
  const firstMarker = Marker.mock.results[0]!.value as ReturnType<typeof createMarker>;

  rerender(<NaverMapMarker {...props} latitude={37.6} zIndex={5} />);
  expect(firstMarker.setMap).toHaveBeenCalledTimes(1);
  expect(firstMarker.setMap).toHaveBeenCalledWith(null);
  expect(removeListener).toHaveBeenCalledTimes(1);
  expect(Marker).toHaveBeenCalledTimes(2);
  expect(Marker).toHaveBeenLastCalledWith(
    expect.objectContaining({
      icon: expect.objectContaining({ url: icon.url }),
      zIndex: 5,
      clickable: false,
      position: new MockPoint(37.6, 127),
    }),
  );
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
