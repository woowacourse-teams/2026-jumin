/**
 * 바텀시트를 세로로 끄는 동작. 시트 종류(고정형·모달)와 무관하게 같은 손맛을 내기 위해 분리했다.
 * 포인터 이벤트만 쓰므로 웹과 iOS 웹뷰에서 동일하게 동작한다.
 */

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** 이 거리 이상 움직였을 때만 드래그로 본다. 탭과 구분하는 기준이다. */
const DRAG_THRESHOLD = 4;

interface SheetDragOptions {
  /** 아래로 끌 수 있는 최대 거리를 그때그때 계산한다. */
  maxOffset: () => number;
  /** 손을 뗐을 때 최종 위치를 정한다. */
  onRelease: (offset: number, maxOffset: number) => void;
}

export const useSheetDrag = ({ maxOffset, onRelease }: SheetDragOptions) => {
  const start = useRef({ pointerY: 0, offset: 0 });
  const dragged = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const finish = useCallback(
    (value: number) => {
      setDragging(false);
      onRelease(value, maxOffset());
    },
    [maxOffset, onRelease],
  );

  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = { pointerY: event.clientY, offset };
      dragged.current = false;
      setDragging(true);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (!dragging) return;
      const moved = event.clientY - start.current.pointerY;
      if (Math.abs(moved) > DRAG_THRESHOLD) dragged.current = true;
      setOffset(Math.min(maxOffset(), Math.max(0, start.current.offset + moved)));
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      if (!dragging) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      finish(start.current.offset + (event.clientY - start.current.pointerY));
    },
    onPointerCancel: () => dragging && finish(offset),
  };

  return {
    offset,
    setOffset,
    dragging,
    handlers,
    /** 방금 끝난 상호작용이 드래그였는지. 뒤따르는 click 을 걸러낼 때 쓴다. */
    consumeDragged: () => {
      const value = dragged.current;
      dragged.current = false;
      return value;
    },
  };
};
