import { css } from '@emotion/css';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { color } from '../../../theme/color';

export type BottomSheetSnap = 'collapsed' | 'medium' | 'full';

/** 클릭과 작은 손떨림을 제외하고 단계 변경을 판단할 최소 이동 거리(px). */
const DRAG_THRESHOLD = 8;

/** 기본 세 단계의 전체 높이. 지도 배치도 같은 계산을 사용한다. */
export const getBottomSheetSnapHeight = (snap: BottomSheetSnap, containerHeight: number) => {
  const heights: Record<BottomSheetSnap, number> = {
    collapsed: 110,
    medium: Math.round(containerHeight * 0.55),
    full: containerHeight,
  };
  return Math.min(heights[snap], containerHeight);
};

interface DragGesture {
  pointerId: number;
  startY: number;
  startHeight: number;
  height: number;
}

const bottomSheetTokens = {
  background: color.background.default,
  radiusTop: 16,
  shadow: '0 -4px 20px rgb(0 0 0 / 10%)',
  handle: {
    width: 40,
    height: 4,
    radius: 999,
    color: color.background.muted,
    paddingTop: 14,
    paddingBottom: 18,
  },
  content: { paddingX: 24, paddingBottomMin: 28 },
  motion: { duration: 250, easing: 'ease-out' },
} as const;

interface Props {
  /** 생략하면 열린 시트로 표시한다. 닫는 전환 동안에는 마운트를 유지한다. */
  open?: boolean;
  /** collapsed(110px)·medium(55%)·full(100%) 중 현재 단계. */
  snap: BottomSheetSnap;
  onSnapChange: (snap: BottomSheetSnap) => void;
  /** 본문과 분리해서 표시할 상단 영역. */
  header?: ReactNode;
  children: ReactNode;
}

interface InteractionOptions {
  open: boolean;
  snap: BottomSheetSnap;
  onSnapChange: (snap: BottomSheetSnap) => void;
}

/** 시트 DOM의 측정·진입 상태·드래그·키보드 조작을 담당하는 내부 훅. */
const useBottomSheetInteraction = ({ open, snap, onSnapChange }: InteractionOptions) => {
  const sheetRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<DragGesture | null>(null);
  const [containerHeight, setContainerHeight] = useState(() => window.innerHeight);
  const [entered, setEntered] = useState(false);

  useLayoutEffect(() => {
    const container = sheetRef.current?.parentElement;
    if (!container) return;

    const measure = () => {
      if (container.clientHeight > 0) setContainerHeight(container.clientHeight);
    };
    const frame = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(container);
    window.addEventListener('resize', measure);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  const points = useMemo(() => {
    const snaps: BottomSheetSnap[] = ['collapsed', 'medium', 'full'];
    return snaps
      .map((id) => ({ id, height: getBottomSheetSnapHeight(id, containerHeight) }))
      .sort((a, b) => a.height - b.height);
  }, [containerHeight]);

  const height = getBottomSheetSnapHeight(snap, containerHeight);
  const activePoint = { id: snap, height };
  const minHeight = Math.min(...points.map((point) => point.height));
  const maxHeight = Math.max(...points.map((point) => point.height));

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const pointerId = gestureRef.current?.pointerId;
    gestureRef.current = null;
    sheet.dataset.dragging = 'false';
    sheet.style.height = `${height}px`;
    const handle = handleRef.current;
    if (pointerId !== undefined && handle?.hasPointerCapture(pointerId)) {
      handle.releasePointerCapture(pointerId);
    }
  }, [height, open, snap]);

  const restoreHeight = (nextHeight: number) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.dataset.dragging = 'false';
    sheet.style.height = `${nextHeight}px`;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const sheet = sheetRef.current;
    if (!open || !sheet || gestureRef.current || event.button !== 0 || !event.isPrimary) return;
    // 전환 중 다시 잡아도 현재 보이는 높이에서 이어 간다.
    const currentHeight = sheet.getBoundingClientRect().height;
    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: currentHeight,
      height: currentHeight,
    };
    sheet.dataset.dragging = 'true';
    sheet.style.height = `${currentHeight}px`;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const sheet = sheetRef.current;
    if (!gesture || !sheet || gesture.pointerId !== event.pointerId) return;
    const nextHeight = gesture.startHeight + gesture.startY - event.clientY;
    gesture.height = Math.min(maxHeight, Math.max(minHeight, nextHeight));
    sheet.style.height = `${gesture.height}px`;
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const delta = gesture.startY - event.clientY;
    const releasedHeight = Math.min(maxHeight, Math.max(minHeight, gesture.startHeight + delta));
    let destination = activePoint;

    if (Math.abs(delta) >= DRAG_THRESHOLD) {
      // 단계 간 간격이 커져도 짧은 드래그만으로 full까지 이동하지 않도록 놓은 높이와 비교한다.
      destination = points.reduce(
        (closest, point) =>
          Math.abs(point.height - releasedHeight) < Math.abs(closest.height - releasedHeight)
            ? point
            : closest,
        activePoint,
      );
    }

    gestureRef.current = null;
    // 부모가 요청을 수락하지 않으면 현재 snap의 높이를 유지한다.
    restoreHeight(height);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onSnapChange(destination.id);
  };

  const cancelDrag = (event?: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || (event && gesture.pointerId !== event.pointerId)) return;
    gestureRef.current = null;
    restoreHeight(height);
    const handle = handleRef.current;
    if (handle?.hasPointerCapture(gesture.pointerId)) {
      handle.releasePointerCapture(gesture.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    const availablePoints = points.filter(
      (point, index) => index === 0 || point.height !== points[index - 1]?.height,
    );
    const index = availablePoints.findIndex((point) => point.height === height);
    const indices: Record<string, number> = {
      ArrowUp: Math.min(index + 1, availablePoints.length - 1),
      ArrowDown: Math.max(index - 1, 0),
      Home: 0,
      End: availablePoints.length - 1,
    };
    const nextIndex = indices[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    cancelDrag();
    const next = availablePoints[nextIndex];
    if (next) onSnapChange(next.id);
  };

  const isFullHeight = height === containerHeight;

  return {
    sheetRef,
    handleRef,
    entered,
    height,
    minHeight,
    maxHeight,
    isFullHeight,
    handlePointerDown,
    handlePointerMove,
    finishDrag,
    cancelDrag,
    handleKeyDown,
  };
};

/**
 * 열림 여부와 단계는 사용처가 정하고, 시트는 측정·드래그·전환·배치를 담당한다.
 * 본문 내부 스크롤은 콘텐츠가 담당하며, 시트 드래그는 핸들에서만 시작한다.
 */
export default function BottomSheet({ open = true, snap, onSnapChange, header, children }: Props) {
  const {
    sheetRef,
    handleRef,
    entered,
    height,
    minHeight,
    maxHeight,
    isFullHeight,
    handlePointerDown,
    handlePointerMove,
    finishDrag,
    cancelDrag,
    handleKeyDown,
  } = useBottomSheetInteraction({ open, snap, onSnapChange });

  return (
    <section
      data-bottom-sheet
      data-open={open}
      data-entered={entered}
      data-full={isFullHeight}
      aria-hidden={!open}
      inert={!open}
      className={sheetStyle}
      ref={sheetRef}
      style={{ height }}
    >
      <div
        ref={handleRef}
        className={handleAreaStyle}
        role="slider"
        tabIndex={open ? 0 : -1}
        aria-label="패널 높이 조절"
        aria-orientation="vertical"
        aria-valuemin={Math.round(minHeight)}
        aria-valuemax={Math.round(maxHeight)}
        aria-valuenow={Math.round(height)}
        aria-valuetext={snap}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
        onKeyDown={handleKeyDown}
      >
        <div className={handleStyle} />
      </div>

      {header && <div className={headerStyle}>{header}</div>}
      <div className={contentStyle}>{children}</div>
    </section>
  );
}

const sheetStyle = css`
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  pointer-events: none;

  background: ${bottomSheetTokens.background};
  border-radius: ${bottomSheetTokens.radiusTop}px ${bottomSheetTokens.radiusTop}px 0 0;
  box-shadow: ${bottomSheetTokens.shadow};
  transform: translate3d(0, calc(100% + 32px), 0);
  transition:
    height ${bottomSheetTokens.motion.duration}ms ${bottomSheetTokens.motion.easing},
    transform ${bottomSheetTokens.motion.duration}ms ${bottomSheetTokens.motion.easing};

  &[data-open='true'] {
    pointer-events: auto;
  }

  &[data-open='true'][data-entered='true'] {
    transform: translate3d(0, 0, 0);
  }

  &[data-dragging='true'] {
    transition: none;
  }

  &[data-full='true'] {
    border-radius: 0;
    box-shadow: none;

    > [role='slider'] {
      padding-top: max(${bottomSheetTokens.handle.paddingTop}px, env(safe-area-inset-top, 0px));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const handleAreaStyle = css`
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  padding: ${bottomSheetTokens.handle.paddingTop}px 0 ${bottomSheetTokens.handle.paddingBottom}px;
  cursor: grab;
  touch-action: none;
  user-select: none;

  &:active {
    cursor: grabbing;
  }

  &:focus-visible {
    outline: 2px solid ${color.focus.ring};
    outline-offset: -2px;
  }
`;

const handleStyle = css`
  width: ${bottomSheetTokens.handle.width}px;
  height: ${bottomSheetTokens.handle.height}px;
  background: ${bottomSheetTokens.handle.color};
  border-radius: ${bottomSheetTokens.handle.radius}px;
`;

const headerStyle = css`
  flex-shrink: 0;
`;

const contentStyle = css`
  --bottom-sheet-content-padding-x: ${bottomSheetTokens.content.paddingX}px;

  flex: 1;
  min-height: 0;
  padding: 0 var(--bottom-sheet-content-padding-x)
    max(${bottomSheetTokens.content.paddingBottomMin}px, env(safe-area-inset-bottom, 0px));
  overflow: hidden;
`;
