import { css } from '@emotion/css';

import brandMark from '../../../assets/icons/brandMark.svg';

export const LoadingPage = () => {
  return (
    <main className={pageStyle} aria-label="주차장 정보를 불러오는 중" aria-busy="true">
      <div className={contentStyle}>
        <img className={logoStyle} src={brandMark} alt="" />
        <p className={brandNameStyle}>주차의민족</p>
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

  color: #fff;
  background: #4356d8;
  border-radius: 28px;
`;

const contentStyle = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26px;
`;

const logoStyle = css`
  width: 92px;
  height: 102px;

  filter: brightness(0) invert(1);
  animation: pulse 1.4s ease-in-out infinite;

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }

    50% {
      transform: scale(0.96);
      opacity: 0.72;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const brandNameStyle = css`
  margin: 0;

  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.6px;
`;
