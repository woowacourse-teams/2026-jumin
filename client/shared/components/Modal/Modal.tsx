import { css, cx } from '@emotion/css';
import ReactModal from 'react-modal';
import { color } from '../../../src/theme/color';
import { typography } from '../../../src/theme/typography';

interface Props {
  onClose: () => void;
  label: string;
  description?: string;
  children: React.ReactNode;
}

export const Modal = ({ onClose, label, description, children }: Props) => {
  return (
    <ReactModal
      isOpen
      onRequestClose={onClose}
      contentLabel={label}
      overlayClassName={overlayStyle}
      className={modalStyle}
      shouldCloseOnOverlayClick
    >
      <h2 className={cx(labelStyle, description && labelWithDescriptionStyle)}>{label}</h2>
      {description && <p className={descriptionStyle}>{description}</p>}

      <button
        type="button"
        className={closeButtonStyle}
        aria-label={`${label} 닫기`}
        onClick={onClose}
      >
        ×
      </button>

      <section className={contentStyle}>{children}</section>
    </ReactModal>
  );
};

const overlayStyle = css`
  position: fixed;
  inset: 0;
  z-index: 2000;

  display: grid;
  place-items: center;

  padding: max(20px, env(safe-area-inset-top, 0px)) 20px max(20px, env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;

  background: ${color.overlay.scrim};
`;

const modalStyle = css`
  position: relative;

  width: min(100%, 340px);
  max-height: 100%;
  padding: 26px 20px 18px;
  box-sizing: border-box;
  overflow-y: auto;

  color: ${color.text.primary};
  background: ${color.background.default};
  border: 0;
  border-radius: 24px;
  box-shadow: 0 24px 64px rgb(16 27 55 / 24%);
  outline: none;
`;

const closeButtonStyle = css`
  position: absolute;
  top: 14px;
  right: 14px;

  display: grid;
  place-items: center;

  width: 36px;
  height: 36px;
  padding: 0;

  color: ${color.icon.default};
  font-family: inherit;
  font-size: 1.625rem;
  line-height: 1;

  background: transparent;
  border: 0;
  border-radius: 10px;
  cursor: pointer;

  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    color: ${color.text.primary};
    background: ${color.background.subtle};
  }

  &:active {
    background: ${color.background.neutralPressed};
  }

  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
  }
`;

const labelStyle = css`
  margin: 0 44px 18px 0;

  ${typography.titleSection};
  color: ${color.text.primary};
  font-family: inherit;
  letter-spacing: -0.4px;
`;

const contentStyle = css`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const labelWithDescriptionStyle = css`
  margin: 0 40px 6px 0;
  color: ${color.text.primary};
  letter-spacing: -0.5px;
`;

const descriptionStyle = css`
  margin: 0 0 14px;

  ${typography.caption};
  color: ${color.text.secondary};
`;
