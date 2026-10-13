import { css, cx } from '@emotion/css';

interface Props {
  onDirections: () => void;
  onRoadView: () => void;
}

export const ParkingDetailActions = ({ onDirections, onRoadView }: Props) => (
  <section className={actionsStyle} aria-label="주차장 빠른 메뉴">
    <button
      className={cx(buttonStyle, directionsStyle)}
      type="button"
      aria-label="길찾기 시작"
      onClick={onDirections}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m3 10 18-7-7 18-4-7-7-4Z" />
      </svg>
      길찾기
    </button>
    <button
      className={cx(buttonStyle, roadViewStyle)}
      type="button"
      aria-label="로드뷰 보기"
      onClick={onRoadView}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6h4l2-2h4l2 2h4v14H4Z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      로드뷰
    </button>
  </section>
);

const actionsStyle = css`
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid #edf0f5;
`;

const buttonStyle = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  min-height: 48px;
  padding: 0 4px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 800;
  white-space: nowrap;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;

  svg {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 2px;
  }
`;

const directionsStyle = css`
  color: #fff;
  background: #4356d8;

  &:hover,
  &:active {
    background: #3548c8;
  }
`;

const roadViewStyle = css`
  color: #4356d8;
  background: #f1f3ff;
  border-color: #dfe4ff;

  &:hover,
  &:active {
    background: #e2e6ff;
  }
`;
