import { css, cx } from '@emotion/css';
import helpButtonIcon from '../../../../assets/icons/helpButtonIcon.svg';
import closeHelpButtonIcon from '../../../../assets/icons/closeHelpButton.svg';

interface Props {
  isOpen: boolean;
  onClick: () => void;
}

export const HelpButton = ({ isOpen, onClick }: Props) => (
  <div
    className={css`
      position: absolute;
      right: 16px;
      bottom: calc(164px + env(safe-area-inset-bottom, 0px));
      z-index: 4;
      pointer-events: auto;
    `}
  >
    <button
      className={css`
        position: relative;
        width: 54px;
        height: 54px;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
      `}
      type="button"
      aria-label={isOpen ? '도움말 메뉴 닫기' : '도움말 메뉴 열기'}
      aria-expanded={isOpen}
      onClick={onClick}
    >
      <img
        className={cx(iconStyle, isOpen && closeIconStyle)}
        src={isOpen ? closeHelpButtonIcon : helpButtonIcon}
        alt=""
        draggable={false}
      />
    </button>
  </div>
);

const iconStyle = css`
  position: absolute;
  top: -2px;
  left: -2px;
  display: block;
  width: 66px;
  height: 66px;
  pointer-events: none;
  user-select: none;
`;

const closeIconStyle = css`
  top: 4px;
  left: 4px;
  width: 54px;
  height: 54px;
`;
