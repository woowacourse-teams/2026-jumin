import { css } from '@emotion/css';
import type { ChangeEventHandler, KeyboardEventHandler, MouseEventHandler } from 'react';
import { SearchIcon } from '../../ui/icons';
import { color } from '../../../../src/theme/color';
import { typography } from '../../../../src/theme/typography';

interface Props {
  onClick?: MouseEventHandler<HTMLDivElement>;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  readOnly?: boolean;
  autoFocus?: boolean;
  showShadow?: boolean;
}

export const SearchBar = ({
  onClick,
  onChange,
  onKeyDown,
  readOnly,
  autoFocus,
  showShadow = true,
}: Props) => (
  <div
    className={css`
      display: flex;
      align-items: center;
      gap: 10px;

      width: min(358px, calc(100% - 32px));
      height: 54px;
      margin: calc(env(safe-area-inset-top, 0px) + clamp(24px, 4dvh, 40px)) auto 0;
      padding: 0 16px;
      box-sizing: border-box;
      box-shadow: ${showShadow ? '5px 5px 15px rgba(0, 0, 0, 0.3)' : 'none'};
      border: 1px solid ${color.border.brand};
      border-radius: 16px;
      background: ${color.background.default};
      pointer-events: auto;
    `}
    onClick={onClick}
  >
    <SearchIcon
      size={20}
      className={css`
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        color: ${color.icon.selected};
        pointer-events: none;
        user-select: none;
      `}
      aria-hidden="true"
    />
    <input
      className={css`
        flex: 1;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
        ${typography.body};
        color: ${color.text.primary};

        &::placeholder {
          color: ${color.text.placeholder};
          opacity: 1;
        }
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
