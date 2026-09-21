import { css, cx } from '@emotion/css';
import { useEffect } from 'react';

import guideIcon from '../../../../assets/icons/guideIcon.svg';
import installIcon from '../../../../assets/icons/installIcon.svg';
import feedbackIcon from '../../../../assets/icons/feedBackIcon.svg';

interface Props {
  onClose: () => void;
  onGuideClick: () => void;
  onInstallClick: () => void;
  onFeedbackClick: () => void;
  isInstallAvailable: boolean;
}

export const HelpPopover = ({
  onClose,
  onGuideClick,
  onInstallClick,
  onFeedbackClick,
  isInstallAvailable,
}: Props) => {
  const selectAction = (action: () => void) => {
    onClose();
    action();
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <>
      <button
        className={backdropStyle}
        type="button"
        aria-label="메뉴 바깥 영역"
        onClick={onClose}
      />
      <div className={popoverStyle} role="group" aria-label="도움말 메뉴">
        <button className={itemStyle} type="button" onClick={() => selectAction(onGuideClick)}>
          <img className={iconStyle} src={guideIcon} alt="" />
          가이드 보기
        </button>
        {isInstallAvailable && (
          <button
            className={cx(itemStyle, hideInStandaloneStyle)}
            type="button"
            onClick={() => selectAction(onInstallClick)}
          >
            <img className={iconStyle} src={installIcon} alt="" />앱 설치
          </button>
        )}
        <button className={itemStyle} type="button" onClick={() => selectAction(onFeedbackClick)}>
          <img className={iconStyle} src={feedbackIcon} alt="" />
          피드백 작성
        </button>
      </div>
    </>
  );
};

const backdropStyle = css`
  position: fixed;
  inset: 0;
  z-index: 2;
  pointer-events: auto;
  padding: 0;
  background: transparent;
  border: 0;
  cursor: default;
`;

const popoverStyle = css`
  position: absolute;
  right: 30px;
  bottom: calc(226px + env(safe-area-inset-bottom, 0px));
  z-index: 3;
  pointer-events: auto;

  width: min(200px, calc(100vw - 32px));
  overflow: hidden;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 8px 24px rgb(20 33 61 / 18%);
`;

const itemStyle = css`
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 72px;
  padding: 0 24px;

  color: #14213d;
  font: inherit;
  font-size: 18px;
  text-align: left;
  background: #fff;
  border: 0;
  cursor: pointer;

  & + & {
    border-top: 1px solid #dce4f0;
  }

  &:hover,
  &:focus-visible {
    background: #f5f6ff;
  }

  &:focus-visible {
    outline: 2px solid #4356d8;
    outline-offset: -2px;
  }
`;

const iconStyle = css`
  width: 20px;
  height: 20px;
  flex: none;
`;

const hideInStandaloneStyle = css`
  @media (display-mode: standalone) {
    display: none;
  }
`;
