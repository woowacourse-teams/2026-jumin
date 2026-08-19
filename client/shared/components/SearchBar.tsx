import { css } from '@emotion/css';
import type { ChangeEventHandler, MouseEventHandler } from 'react';
import searchIcon from '../../assets/icons/searchIcon.svg';

interface Props {
  onClick?: MouseEventHandler<HTMLDivElement>;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  value?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
}

const SearchBar = ({ onClick, onChange, value, readOnly, autoFocus }: Props) => (
  <div
    className={css`
      display: flex;
      align-items: center;
      gap: 10px;

      width: 100%;
      max-width: 358px;
      height: 54px;
      margin: 16px auto 0;
      padding: 0 16px;
      box-sizing: border-box;

      border: 1px solid #155eef;
      border-radius: 16px;
      background: white;
    `}
    onClick={onClick}
  >
    <img
      className={css`
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      `}
      src={searchIcon}
      alt=""
    />
    <input
      className={css`
        flex: 1;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
      `}
      aria-label="목적지 검색"
      placeholder="어디에 방문하세요?"
      value={value}
      readOnly={readOnly}
      autoFocus={autoFocus}
      onChange={onChange}
    />
  </div>
);

export default SearchBar;
