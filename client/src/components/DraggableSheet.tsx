/**
 * 손잡이를 끌어 접었다 펼 수 있는 바텀시트.
 * 화면에 계속 붙어 있는 시트용이며, 모달 시트는 DialogSheet 를 쓴다.
 */

import styled from '@emotion/styled';
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

import { useSheetDrag } from './useSheetDrag';

/**
 * 네이티브 지도에게 웹 UI 영역을 다시 읽으라고 알린다.
 * 시트를 접거나 펴면 transform 만 바뀌어 네이티브가 스스로 알아채지 못한다.
 */
const syncNativeTouchRegions = () => {
  (window as Window & { __nativeReportTouchRegions?: () => void }).__nativeReportTouchRegions?.();
};

const Sheet = styled.div<{ top: number; bottomInset: string; dragging: boolean }>`
  position: absolute;
  z-index: 4;
  top: ${({ top }) => top}px;
  right: 0;
  bottom: ${({ bottomInset }) => bottomInset};
  left: 0;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  background: #fff;
  box-shadow: 0 -10px 28px rgba(20, 33, 61, 0.12);
  transition: ${({ dragging }) => (dragging ? 'none' : 'transform 220ms ease-out')};
  will-change: transform;
  /* 위치를 인라인 style 이 아니라 변수로 받아, 넓은 화면에서 CSS 로 되돌릴 수 있게 한다. */
  transform: translateY(var(--sheet-offset, 0px));

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  /* 넓은 화면에서는 끌어내리는 시트가 아니라 왼쪽 패널에 고정된 목록이다. */
  @media (min-width: 768px) {
    top: var(--header-height);
    right: auto;
    left: var(--rail-width);
    width: var(--panel-width);
    transform: none;
    border-radius: 0;
    border-right: 1px solid #edf0f4;
    box-shadow: none;
  }
`;

const Grabber = styled.button`
  display: grid;
  width: 100%;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border: 0;
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  background: transparent;
  touch-action: none;

  @media (min-width: 768px) {
    display: none;
  }

  &::before {
    content: '';
    display: block;
    width: 42px;
    height: 4px;
    border-radius: 999px;
    background: #c4ccd8;
  }
`;

const Body = styled.div`
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;

  /* 손잡이를 감춘 만큼 위쪽 여백을 대신 준다. */
  @media (min-width: 768px) {
    padding-top: 14px;
  }
`;

interface DraggableSheetProps {
  children: ReactNode;
  /** 펼친 상태에서 시트 상단이 화면 위에서 떨어진 거리(px) */
  expandedTop: number;
  /** 접었을 때 화면에 남겨둘 높이(px) */
  peek?: number;
  /** 시트 아래에 비워둘 공간. 하단 내비게이션 등이 있을 때 쓴다. */
  bottomInset?: string;
  /**
   * 값이 바뀌면 시트를 접는다. 지도처럼 시트 밖을 눌렀을 때 쓰는 신호다.
   * 같은 요청이 반복돼도 반응해야 하므로 boolean 이 아니라 증가하는 수로 받는다.
   */
  collapseSignal?: number;
  label?: string;
}

export const DraggableSheet = ({
  children,
  expandedTop,
  peek = 148,
  bottomInset = 'var(--nav-height)',
  collapseSignal = 0,
  label = '상세 정보',
}: DraggableSheetProps) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  const maxOffset = useCallback(() => {
    const height = sheetRef.current?.getBoundingClientRect().height ?? 0;
    return Math.max(0, height - peek);
  }, [peek]);

  const { offset, setOffset, dragging, handlers, consumeDragged } = useSheetDrag({
    maxOffset,
    onRelease: (value, limit) => setOffset(value > limit / 2 ? limit : 0),
  });

  // 화면 크기가 바뀌면 접힌 정도를 새 높이에 맞춘다.
  useEffect(() => {
    const clamp = () => setOffset((current) => Math.min(current, maxOffset()));
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [maxOffset, setOffset]);

  useEffect(() => {
    if (collapseSignal) setOffset(maxOffset());
  }, [collapseSignal, maxOffset, setOffset]);

  // 접힘 정도가 바뀌면 네이티브가 아는 시트 위치도 갱신해야 한다.
  useEffect(() => {
    syncNativeTouchRegions();
  }, [offset]);

  const collapsed = offset > 0;

  return (
    <Sheet
      ref={sheetRef}
      data-native-sheet="true"
      role="region"
      aria-label={label}
      top={expandedTop}
      bottomInset={bottomInset}
      dragging={dragging}
      style={{ '--sheet-offset': `${offset}px` } as CSSProperties}
      onTransitionEnd={syncNativeTouchRegions}
    >
      <Grabber
        type="button"
        aria-label={collapsed ? `${label} 펼치기` : `${label} 접기`}
        aria-expanded={!collapsed}
        {...handlers}
        onClick={() => {
          // 끌어서 옮긴 직후에는 브라우저가 click 을 이어서 보낸다. 그 click 이 토글을 되돌리지 않게 한다.
          if (consumeDragged()) return;
          setOffset(collapsed ? 0 : maxOffset());
        }}
      />
      <Body>{children}</Body>
    </Sheet>
  );
};
