import { css } from '@emotion/css';

import brandMark from '../../../assets/icons/brandMark.svg';

interface Props {
  onRetry: () => void;
}

export const ErrorPage = ({ onRetry }: Props) => {
  return (
    <main className={pageStyle}>
      <div className={contentStyle} role="alert">
        <h1 className={titleStyle}>다시 시도해주세요</h1>
        <img className={logoStyle} src={brandMark} alt="" />
        <button className={retryButtonStyle} type="button" onClick={onRetry}>
          <span aria-hidden="true">↻</span>
          다시 시도
        </button>
      </div>
    </main>
  );
};

const pageStyle = css`
  display: grid;
  place-items: center;

  width: min(100%, 390px);
  height: min(100dvh, 844px);
  min-height: 600px;
  margin: 0 auto;
  overflow: hidden;

  color: #101b37;
  background: #fff;
  border-radius: 28px;
`;

const contentStyle = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;

  transform: translateY(-22px);
`;

const titleStyle = css`
  margin: 0;

  font-size: 22px;
  font-weight: 800;
  line-height: 1.35;
  letter-spacing: -0.8px;
`;

const logoStyle = css`
  width: 72px;
  height: 80px;
`;

const retryButtonStyle = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  min-width: 124px;
  min-height: 48px;
  padding: 0 20px;

  color: #fff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;

  background: #4356d8;
  border: 0;
  border-radius: 12px;
  cursor: pointer;

  &:active {
    background: #3548c8;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 3px;
  }
`;
