import { css } from '@emotion/css';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type UIEvent } from 'react';

const ITEM_HEIGHT = 27;
const VISIBLE_ITEM_COUNT = 3;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEM_COUNT;
const WHEEL_PADDING = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

interface WheelColumnProps {
  ariaLabel: string;
  options: readonly number[];
  value: number;
  onChange: (value: number) => void;
}

export function WheelColumn({ ariaLabel, options, value, onChange }: WheelColumnProps) {
  const initialIndex = Math.max(options.indexOf(value), 0);

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const moveToIndex = (index: number, behavior: ScrollBehavior) => {
    const option = options[index];

    if (option === undefined) {
      return;
    }

    setActiveIndex(index);
    listRef.current?.scrollTo({
      top: index * ITEM_HEIGHT,
      behavior,
    });
    onChange(option);
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const scrollElement = event.currentTarget;
    const nextIndex = Math.round(scrollElement.scrollTop / ITEM_HEIGHT);

    if (options[nextIndex] === undefined) {
      return;
    }

    setActiveIndex((previousIndex) => (previousIndex === nextIndex ? previousIndex : nextIndex));

    if (scrollTimerRef.current !== null) {
      clearTimeout(scrollTimerRef.current);
    }

    scrollTimerRef.current = setTimeout(() => {
      const selectedIndex = Math.round(scrollElement.scrollTop / ITEM_HEIGHT);
      const selectedOption = options[selectedIndex];

      if (selectedOption === undefined) {
        return;
      }

      scrollElement.scrollTo({
        top: selectedIndex * ITEM_HEIGHT,
        behavior: 'smooth',
      });
      onChange(selectedOption);
    }, 100);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();

    const direction = event.key === 'ArrowUp' ? -1 : 1;
    const nextIndex = Math.min(options.length - 1, Math.max(0, activeIndex + direction));

    moveToIndex(nextIndex, 'smooth');
  };

  useLayoutEffect(() => {
    const selectedIndex = options.indexOf(value);

    if (selectedIndex === -1 || listRef.current === null) {
      return;
    }

    listRef.current.scrollTop = selectedIndex * ITEM_HEIGHT;
  }, [options, value]);

  useEffect(
    () => () => {
      if (scrollTimerRef.current !== null) {
        clearTimeout(scrollTimerRef.current);
      }
    },
    [],
  );

  return (
    <div
      ref={listRef}
      className={wheelListStyle}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => {
        const isActive = index === activeIndex;

        return (
          <button
            key={option}
            type="button"
            role="option"
            aria-selected={isActive}
            className={[wheelOptionStyle, isActive ? activeOptionStyle : ''].join(' ')}
            onClick={() => moveToIndex(index, 'smooth')}
          >
            {String(option).padStart(2, '0')}
          </button>
        );
      })}
    </div>
  );
}

const wheelListStyle = css`
  width: 64px;
  height: ${WHEEL_HEIGHT}px;

  padding-block: ${WHEEL_PADDING}px;
  box-sizing: border-box;

  overflow-y: auto;
  scroll-padding-block: ${WHEEL_PADDING}px;
  scroll-snap-type: y mandatory;
  overscroll-behavior: contain;

  scrollbar-width: none;

  &:focus-visible {
    outline: 2px solid rgb(67 86 216 / 35%);
    outline-offset: -2px;
  }

  &::-webkit-scrollbar {
    display: none;
  }
`;

const wheelOptionStyle = css`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;

  width: 100%;
  height: ${ITEM_HEIGHT}px;

  border: 0;
  padding: 0;
  appearance: none;

  color: #a7adba;
  font-family: inherit;
  font-size: 18px;
  font-weight: 400;
  line-height: 1;
  font-variant-numeric: tabular-nums;

  background: transparent;
  opacity: 0.45;

  scroll-snap-align: center;
  scroll-snap-stop: always;
  cursor: pointer;

  transition:
    color 100ms ease,
    font-size 100ms ease,
    font-weight 100ms ease,
    opacity 100ms ease;
`;

const activeOptionStyle = css`
  color: #101b37;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -1px;

  opacity: 1;
`;
