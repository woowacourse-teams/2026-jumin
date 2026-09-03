import { css } from '@emotion/css';
import React, { useEffect, useRef, type ReactNode } from 'react';

export const BOTTOM_SHEET_HEIGHT = 500;
const PEEK_HEIGHT = 120;
const COLLAPSED_Y = BOTTOM_SHEET_HEIGHT - PEEK_HEIGHT;
const SNAP_THRESHOLD = 80;

// 바텀시트 열렸는지 여부
export type BottomSheetSnap = 'expanded' | 'collapsed';

interface Props {
  children: ReactNode;
  snap: BottomSheetSnap;
  onSnapChange: (snap: BottomSheetSnap) => void;
}

export default function BottomSheet({ children, snap, onSnapChange }: Props) {
  const sheetRef = useRef<HTMLElement>(null);

  const sheetY = snap === 'expanded' ? 0 : COLLAPSED_Y;

  const dragStartPointerYRef = useRef(0); // 드래그 시작한 위치
  const dragStartSheetYRef = useRef(sheetY); // 드래그 시작 시 시트 위치
  const currentSheetYRef = useRef(sheetY); // 현재 시트 위치

  const isDraggingRef = useRef(false);

  useEffect(() => {
    currentSheetYRef.current = sheetY;
  }, [sheetY]);

  const finishDrag = () => {
    if (!isDraggingRef.current || !sheetRef.current) return;

    isDraggingRef.current = false;

    const movedDistance = currentSheetYRef.current - dragStartSheetYRef.current;

    let destination = dragStartSheetYRef.current < COLLAPSED_Y / 2 ? 0 : COLLAPSED_Y;

    if (Math.abs(movedDistance) >= SNAP_THRESHOLD) {
      destination = movedDistance < 0 ? 0 : COLLAPSED_Y;
    }

    sheetRef.current.style.transition = 'transform 250ms ease-out';
    sheetRef.current.style.transform = `translateY(${destination}px)`;

    currentSheetYRef.current = destination;
    onSnapChange(destination === 0 ? 'expanded' : 'collapsed');
  };

  // 드래그 시작 핸들러
  // 영역을 누른 위치를 저장한다.
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!sheetRef.current) return;

    isDraggingRef.current = true;
    dragStartPointerYRef.current = event.clientY;
    dragStartSheetYRef.current = currentSheetYRef.current;

    sheetRef.current.style.transition = 'none';
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  // 드래그한 거리만큼 움직이는 핸들러
  // 드래그 시작 위치와 현재 포인터 위치의 차이를 구한다.
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (!sheetRef.current) return;

    const movedDistance = event.clientY - dragStartPointerYRef.current;

    const nextSheetY = dragStartSheetYRef.current + movedDistance;

    const limitedSheetY = Math.min(COLLAPSED_Y, Math.max(0, nextSheetY));

    currentSheetYRef.current = limitedSheetY;

    sheetRef.current.style.transform = `translateY(${limitedSheetY}px)`;
  };

  return (
    <section
      data-bottom-sheet
      className={sheetStyle}
      ref={sheetRef}
      style={{
        transform: `translate3d(0, ${sheetY}px, 0)`,
      }}
    >
      <div
        className={handleAreaStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
      >
        <div className={handleStyle} />
      </div>

      <div className={contentStyle}>{children}</div>
    </section>
  );
}

const sheetStyle = css`
  display: flex;
  flex-direction: column;
  pointer-events: auto;

  background-color: #fff;

  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 1000;

  width: 100%;
  height: ${BOTTOM_SHEET_HEIGHT}px;

  border-radius: 16px 16px 0 0;
  box-shadow: 0 -4px 20px rgb(0 0 0 / 10%);

  transform: translateY(0);
  transition: transform 250ms ease-out;

  will-change: transform;
`;

const handleAreaStyle = css`
  display: flex;
  flex-shrink: 0;
  justify-content: center;

  padding: 14px 0 18px;

  cursor: grab;
  touch-action: none;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
`;

const handleStyle = css`
  width: 40px;
  height: 4px;

  background-color: #d9deeb;
  border-radius: 999px;
`;

const contentStyle = css`
  flex: 1;
  min-height: 0;

  padding: 0 24px max(28px, env(safe-area-inset-bottom));
  overflow-y: auto;
  overscroll-behavior: contain;
`;
