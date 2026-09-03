import { css } from '@emotion/css';

import brandMark from '../../../../assets/icons/brandMark.svg';
import { showInstallGuide } from '../../../../shared/pwa/addToHomeScreen';

export const InstallAppButton = () => (
  <button className={buttonStyle} type="button" onClick={showInstallGuide}>
    <span className={iconContainerStyle} aria-hidden="true">
      <img className={iconStyle} src={brandMark} alt="" draggable={false} />
    </span>

    <span className={copyStyle}>
      <strong className={titleStyle}>홈 화면에 설치</strong>
      <span className={descriptionStyle}>앱처럼 빠르게 주차장을 찾아보세요.</span>
    </span>

    <span className={chevronStyle} aria-hidden="true">
      ›
    </span>
  </button>
);

const buttonStyle = css`
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 14px;

  width: 100%;
  min-height: 76px;
  margin-top: 18px;
  padding: 14px 18px;

  color: #101b37;
  font-family: inherit;
  text-align: left;

  background: #ffffff;
  border: 1px solid #e1e5f3;
  border-radius: 18px;
  box-shadow: 0 5px 14px rgb(16 27 55 / 8%);
  cursor: pointer;

  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    transform 100ms ease;

  &:hover {
    background: #f7f8ff;
    border-color: #b8c0f3;
  }

  &:active {
    background: #eef0ff;
    transform: translateY(1px);
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 3px;
  }

  @media (display-mode: standalone) {
    display: none;
  }
`;

const iconContainerStyle = css`
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;

  background: #eef0ff;
  border-radius: 14px;
`;

const iconStyle = css`
  width: 23px;
  height: 26px;

  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
`;

const copyStyle = css`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
`;

const titleStyle = css`
  font-size: 16px;
  font-weight: 800;
  line-height: 1.4;
`;

const descriptionStyle = css`
  overflow: hidden;

  color: #69758b;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const chevronStyle = css`
  justify-self: end;

  color: #8d97aa;
  font-size: 30px;
  font-weight: 300;
  line-height: 1;
`;
