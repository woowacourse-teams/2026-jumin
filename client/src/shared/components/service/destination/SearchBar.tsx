import { css, cx } from '@emotion/css';
import type { ChangeEventHandler, KeyboardEventHandler } from 'react';
import { SearchIcon } from '../../ui/icons';
import { color } from '../../../../theme/color';
import { duration, easing, pressScale } from '../../../../theme/motion';
import { radius } from '../../../../theme/radius';
import { shadow } from '../../../../theme/shadow';
import { typography } from '../../../../theme/typography';

interface Props {
  onClick?: () => void;
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
}: Props) => {
  const searchBarStyle = css`
    display: flex;
    align-items: center;
    gap: 10px;
    width: min(358px, calc(100% - 32px));
    height: 54px;
    margin: calc(env(safe-area-inset-top, 0px) + clamp(24px, 4dvh, 40px)) auto 0;
    padding: 0 18px;
    box-sizing: border-box;
    /* 지도 위에서는 그림자로 띄우고, 흰 화면 위에서는 중립색 선으로 경계를 표시한다. */
    box-shadow: ${showShadow ? shadow.floating : `inset 0 0 0 1.5px ${color.border.default}`};
    border: 0;
    border-radius: ${radius.pill};
    background: ${color.background.default};
    pointer-events: auto;
    text-align: left;

    &:focus-within {
      outline: var(--focus-ring-width) solid var(--focus-ring-color);
      outline-offset: var(--focus-ring-offset);
    }
  `;
  const searchIcon = <SearchIcon size={20} className={searchIconStyle} aria-hidden="true" />;

  if (onClick) {
    return (
      <button
        type="button"
        className={cx(searchBarStyle, pressableStyle)}
        onClick={onClick}
        aria-label="목적지 검색"
      >
        {searchIcon}
        <span className={placeholderStyle}>어디에 방문하세요?</span>
      </button>
    );
  }

  return (
    <div className={searchBarStyle}>
      {searchIcon}
      <input
        className={inputStyle}
        aria-label="목적지 검색"
        placeholder="어디에 방문하세요?"
        readOnly={readOnly}
        autoFocus={autoFocus}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
    </div>
  );
};

/** 검색 화면으로 이동하는 버튼일 때의 누름 반응. */
const pressableStyle = css`
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform ${duration.fast} ${easing.out},
    background-color ${duration.fast} ${easing.out};

  &:active {
    background: ${color.background.subtle};
    transform: scale(${pressScale});
  }
`;

const searchIconStyle = css`
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: ${color.icon.brand};
  pointer-events: none;
  user-select: none;
`;

const inputStyle = css`
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  ${typography.body};
  color: ${color.text.primary};

  &:focus-visible {
    outline: 0;
  }

  &::placeholder {
    color: ${color.text.placeholder};
    opacity: 1;
  }
`;

const placeholderStyle = css`
  ${typography.body};
  color: ${color.text.placeholder};
`;
