/** 모달 바텀시트. 포커스 트랩과 Escape 닫기를 포함한다. */

import styled from '@emotion/styled';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';

import { useSheetDrag } from './useSheetDrag';

import { colors } from './tokens';

const Scrim = styled.div`
  position: fixed;
  z-index: 20;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(20, 33, 61, 0.42);
`;

const Sheet = styled.div<{ dragging: boolean }>`
  width: min(100%, var(--app-max-width));
  transition: ${({ dragging }) => (dragging ? 'none' : 'transform 220ms ease-out')};
  will-change: transform;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  max-height: min(82dvh, 720px);
  padding: 10px var(--gutter) calc(24px + var(--safe-bottom));
  overflow: auto;
  border-radius: 24px 24px 0 0;
  background: ${colors.surface};
  box-shadow: 0 -14px 40px rgba(25, 34, 70, 0.2);
`;

const Handle = styled.button`
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  margin: 0 0 18px;
  background: transparent;
  touch-action: none;

  &::before {
    content: '';
    display: block;
    width: 44px;
    height: 4px;
    margin: 6px auto;
    border-radius: 999px;
    background: #dce4f0;
  }
`;

export const DialogTitle = styled.h2`
  margin: 0 0 18px;
  font-size: 22px;
  line-height: 30px;
`;

export const DialogSheet = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);

  // 아래로 시트 높이의 1/3 넘게 끌면 닫는다.
  const maxOffset = useCallback(() => ref.current?.getBoundingClientRect().height ?? 0, []);
  const { offset, setOffset, dragging, handlers, consumeDragged } = useSheetDrag({
    maxOffset,
    onRelease: (value, limit) => {
      if (value > limit / 3) onClose();
      else setOffset(0);
    },
  });

  useEffect(() => {
    const sheet = ref.current;
    const triggerElement = trigger.current;
    const focusable = () =>
      Array.from(
        sheet?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      triggerElement?.focus();
    };
  }, [onClose]);

  return (
    <Scrim role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <Sheet
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        dragging={dragging}
        style={{ transform: `translateY(${offset}px)` }}
      >
        <Handle
          type="button"
          aria-label="닫기"
          {...handlers}
          onClick={() => {
            if (consumeDragged()) return;
            onClose();
          }}
        />
        <DialogTitle id="dialog-title">{title}</DialogTitle>
        {children}
      </Sheet>
    </Scrim>
  );
};
