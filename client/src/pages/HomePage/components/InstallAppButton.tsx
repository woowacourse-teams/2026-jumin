import { css } from '@emotion/css';
import { useEffect, useSyncExternalStore } from 'react';

import brandMark from '../../../../assets/icons/brandMark.svg';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';
import {
  getInstallAvailability,
  initializeInstallPrompt,
  requestPwaInstall,
  subscribeToInstallAvailability,
} from '../../../../shared/pwa/installPrompt';

export const InstallAppButton = () => {
  const isInstallAvailable = useSyncExternalStore(
    subscribeToInstallAvailability,
    getInstallAvailability,
    () => false,
  );

  useEffect(() => {
    initializeInstallPrompt();
  }, []);

  if (!isInstallAvailable) return null;

  return (
    <button
      className={buttonStyle}
      type="button"
      onClick={() => {
        void requestPwaInstall();
      }}
    >
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
};

const buttonStyle = css`
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 14px;

  width: 100%;
  min-height: 76px;
  margin-top: 18px;
  padding: 14px 18px;

  color: ${color.text.primary};
  font-family: inherit;
  text-align: left;

  background: ${color.background.default};
  border: 1px solid ${color.border.default};
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
    background: ${color.background.brandSubtle};
    border-color: ${color.border.brandSubtle};
  }

  &:active {
    background: ${color.background.brandSubtlePressed};
    transform: translateY(1px);
  }

  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
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

  background: ${color.background.brandSubtle};
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
  ${typography.bodyStrong};
`;

const descriptionStyle = css`
  overflow: hidden;

  ${typography.bodySmall};
  color: ${color.text.secondary};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const chevronStyle = css`
  justify-self: end;

  color: ${color.icon.default};
  ${typography.titleSection}
  line-height: 1;
`;
