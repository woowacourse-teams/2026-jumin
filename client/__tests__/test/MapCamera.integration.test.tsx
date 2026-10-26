import { jest } from '@jest/globals';
import { cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';

import { ConditionBar } from '../../shared/components/service/ConditionBar';
import { getMapCenterForMarkerY } from '../../shared/maps/getMapCenterForMarkerY';

class MockPoint {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

let originalNaver: PropertyDescriptor | undefined;

beforeEach(() => {
  originalNaver = Object.getOwnPropertyDescriptor(globalThis, 'naver');
  Object.defineProperty(globalThis, 'naver', {
    configurable: true,
    value: { maps: { Point: MockPoint } },
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
  { label: '홈 바텀시트 위', height: 800, targetY: 236, centerY: 514 },
  { label: '추천 화면의 보이는 영역 중앙', height: 800, targetY: 210, centerY: 540 },
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

it('검색 조건 바의 실제 요소를 ref로 전달하며 ref가 없는 기존 호출도 유지한다', () => {
  const elementRef = createRef<HTMLElement>();
  const onBack = jest.fn();
  const { rerender } = render(
    <ConditionBar elementRef={elementRef} title="강남역" onBack={onBack} />,
  );

  expect(elementRef.current).toBe(screen.getByRole('banner', { name: '검색 조건' }));

  rerender(<ConditionBar title="강동역" onBack={onBack} />);

  expect(elementRef.current).toBeNull();
  expect(screen.getByRole('banner', { name: '검색 조건' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '강동역' })).toBeInTheDocument();
});
