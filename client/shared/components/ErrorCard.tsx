import { css } from '@emotion/css';

import brandMark from '../../assets/icons/brandMark.svg';

interface Props {
  label: string;
  onRetry: () => void;
}

export const ErrorCard = ({ label, onRetry }: Props) => (
  <section className={errorStyle} role="alert">
    <img className={logoStyle} src={brandMark} alt="" draggable={false} />

    <div className={messageStyle}>
      <h2 className={titleStyle}>{label}</h2>
      <p className={descriptionStyle}>네트워크 상태를 확인한 후 다시 시도해 주세요.</p>
    </div>

    <button className={retryButtonStyle} type="button" onClick={onRetry}>
      <RetryIcon />
      다시 시도
    </button>
  </section>
);

const RetryIcon = () => (
  <svg className={retryIconStyle} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 11a8 8 0 1 0-2.34 5.66" />
    <path d="M20 4v7h-7" />
  </svg>
);

const errorStyle = css`
  position: absolute;
  right: 16px;
  bottom: max(24px, env(safe-area-inset-bottom));
  left: 16px;
  z-index: 20;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  pointer-events: auto;

  padding: 28px 24px 24px;

  color: #101b37;
  text-align: center;

  background: rgb(255 255 255 / 96%);
  border: 1px solid rgb(67 86 216 / 12%);
  border-radius: 24px;
  box-shadow: 0 8px 24px rgb(16 27 55 / 14%);
  backdrop-filter: blur(8px);
`;

const logoStyle = css`
  width: 58px;
  height: 64px;

  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
`;

const messageStyle = css`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const titleStyle = css`
  margin: 0;

  font-size: 19px;
  font-weight: 800;
  line-height: 1.35;
  letter-spacing: -0.6px;
`;

const descriptionStyle = css`
  margin: 0;

  color: #697386;
  font-size: 14px;
  line-height: 1.5;
`;

const retryButtonStyle = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  width: 100%;
  min-height: 52px;
  padding: 0 20px;

  color: #ffffff;
  font: inherit;
  font-size: 16px;
  font-weight: 700;

  background: #4356d8;
  border: 0;
  border-radius: 14px;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    background: #3b4dcc;
  }

  &:active {
    background: #3548c8;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 3px;
  }
`;

const retryIconStyle = css`
  width: 22px;
  height: 22px;

  stroke: currentcolor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
`;
