import { css } from '@emotion/css';
import type { ChangeEventHandler, KeyboardEventHandler, MouseEventHandler } from 'react';
import searchIcon from '../../assets/icons/searchIcon.svg';

interface Props {
  onClick?: MouseEventHandler<HTMLDivElement>;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  readOnly?: boolean;
  autoFocus?: boolean;
}

export const SearchBar = ({ onClick, onChange, onKeyDown, readOnly, autoFocus }: Props) => (
  <div
    className={css`
      display: flex;
      align-items: center;
      gap: 10px;

      width: 100%;
      max-width: 358px;
      height: 54px;
      margin: calc(env(safe-area-inset-top, 0px) + clamp(24px, 4dvh, 40px)) auto 0;
      padding: 0 16px;
      box-sizing: border-box;

      @supports (-webkit-touch-callout: none) {
        @media (display-mode: standalone) {
          margin-top: max(
            calc(env(safe-area-inset-top, 0px) + clamp(24px, 4dvh, 40px)),
            clamp(56px, 9dvh, 88px)
          );
        }
      }

      border: 1px solid #4356d8;
      border-radius: 16px;
      background: white;
      pointer-events: auto;
    `}
    onClick={onClick}
  >
    <img
      className={css`
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        pointer-events: none;
        user-select: none;
      `}
      src={searchIcon}
      alt=""
      draggable={false}
    />
    <input
      className={css`
        flex: 1;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
        font-size: 16px;
      `}
      aria-label="목적지 검색"
      placeholder="어디에 방문하세요?"
      readOnly={readOnly}
      autoFocus={autoFocus}
      onChange={onChange}
      onKeyDown={onKeyDown}
    />
  </div>
);
