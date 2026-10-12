import { css } from '@emotion/css';

/** 추천 페이지에서 입/출차 시간을 변경할 수 있도록  */
export const PeriodChangeControl = () => {
  return (
    <button className={buttonStyle} type="button">
      시간 변경
    </button>
  );
};

const buttonStyle = css`
  min-height: 32px;
  padding: 0 10px;

  color: #4356d8;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;

  background: #f5f6ff;
  border: 0;
  border-radius: 10px;
  cursor: pointer;

  &:hover {
    background: #e9edff;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 2px;
  }
`;
