import { useEffect } from 'react';
import { color } from '../../theme/color';
import { durationMs } from '../../theme/motion';

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface Props {
  map: naver.maps.Map | null;
  /**
   * 선이 지나는 좌표. 첫 좌표에서 시작해 마지막 좌표까지 뻗어 나간다.
   * 같은 경로를 다시 그리지 않도록 부모에서 참조를 유지해 전달한다.
   */
  path: Coordinate[];
}

const LINE = {
  weight: 5,
  /** 지도 색과 겹쳐도 읽히도록 선 아래에 까는 흰 띠의 두께. */
  casingWeight: 9,
  /** 반경 원(1)보다 위, 마커(5 이상)보다 아래. */
  casingZIndex: 2,
  zIndex: 3,
  /** 경로가 길수록 조금 더 오래 그린다. */
  drawDuration: durationMs.slow * 1.5,
} as const;

/** 천천히 출발해 천천히 멈춘다. motion.ts의 easing.inOut과 같은 성격의 곡선이다. */
const easeInOut = (progress: number) =>
  progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;

const reducesMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 짧은 구간이라 평면으로 근사한 두 좌표 사이의 상대 거리. 구간 비율 계산에만 쓴다. */
const getSegmentLength = (from: Coordinate, to: Coordinate) => {
  const longitudeScale = Math.cos((from.latitude * Math.PI) / 180);

  return Math.hypot(to.latitude - from.latitude, (to.longitude - from.longitude) * longitudeScale);
};

/** 전체 길이의 progress(0~1)만큼만 잘라 낸 좌표 목록을 돌려준다. */
const slicePath = (path: Coordinate[], segmentLengths: number[], progress: number) => {
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  let remaining = totalLength * progress;
  const sliced: Coordinate[] = [path[0]!];

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index]!;
    const from = path[index]!;
    const to = path[index + 1]!;

    if (remaining >= length) {
      sliced.push(to);
      remaining -= length;
      continue;
    }

    const ratio = length === 0 ? 0 : remaining / length;
    sliced.push({
      latitude: from.latitude + (to.latitude - from.latitude) * ratio,
      longitude: from.longitude + (to.longitude - from.longitude) * ratio,
    });
    break;
  }

  return sliced;
};

/**
 * 도보 경로를 지도에 그린다. 카드의 도보 거리 막대와 같은 색을 쓰고,
 * 첫 좌표에서 마지막 좌표 쪽으로 선이 뻗어 나가며 나타난다.
 */
export const WalkingRouteLine = ({ map, path }: Props) => {
  useEffect(() => {
    if (!map || path.length < 2) return;

    const toLatLng = ({ latitude, longitude }: Coordinate) =>
      new naver.maps.LatLng(latitude, longitude);
    const start = toLatLng(path[0]!);
    const createLine = (options: Omit<naver.maps.PolylineOptions, 'path'>) =>
      new naver.maps.Polyline({
        map,
        path: [start, start],
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
        ...options,
      });
    const casing = createLine({
      strokeColor: color.background.default,
      strokeWeight: LINE.casingWeight,
      zIndex: LINE.casingZIndex,
    });
    const line = createLine({
      strokeColor: color.walkingDistance.barSelected,
      strokeWeight: LINE.weight,
      zIndex: LINE.zIndex,
    });

    const segmentLengths = path
      .slice(1)
      .map((coordinate, index) => getSegmentLength(path[index]!, coordinate));
    const draw = (progress: number) => {
      const visiblePath = slicePath(path, segmentLengths, progress).map(toLatLng);
      casing.setPath(visiblePath);
      line.setPath(visiblePath);
    };

    let frame = 0;
    if (reducesMotion() || typeof window.requestAnimationFrame !== 'function') {
      draw(1);
    } else {
      const startedAt = performance.now();
      const step = (now: number) => {
        const progress = Math.min((now - startedAt) / LINE.drawDuration, 1);
        draw(easeInOut(progress));
        if (progress < 1) frame = window.requestAnimationFrame(step);
      };
      frame = window.requestAnimationFrame(step);
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      casing.setMap(null);
      line.setMap(null);
    };
  }, [map, path]);

  return null;
};
