import { css, cx } from '@emotion/css';
import ReactModal from 'react-modal';
import { Stack } from './Stack';
import { CloseIcon } from './icons';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';

const MODAL = {
  maxWidth: '340px',
  padding: '26px 20px 18px',
  radius: '24px',
  shadow: '0 24px 64px rgb(16 27 55 / 24%)',
  zIndex: 2000,
  closeOffset: '14px',
  closeSize: '36px',
  closeRadius: '10px',
  closeIconSize: 24,
} as const;

if (typeof document !== 'undefined') {
  const appElement = document.querySelector<HTMLElement>('#root, #storybook-root');
  if (appElement) ReactModal.setAppElement(appElement);
}

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
        <CloseIcon size={MODAL.closeIconSize} aria-hidden="true" />
      </button>

      <Stack as="section">{children}</Stack>
    </ReactModal>
  );
};

const overlayStyle = css`
  position: fixed;
  inset: 0;
  z-index: ${MODAL.zIndex};

  display: grid;
  place-items: center;

  padding: max(20px, env(safe-area-inset-top, 0px)) 20px max(20px, env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;

  background: ${color.overlay.scrim};
`;

const modalStyle = css`
  position: relative;

  width: min(100%, ${MODAL.maxWidth});
  max-height: 100%;
  padding: ${MODAL.padding};
  box-sizing: border-box;
  overflow-y: auto;

  color: ${color.text.primary};
  background: ${color.background.default};
  border: 0;
  border-radius: ${MODAL.radius};
  box-shadow: ${MODAL.shadow};
  outline: none;
`;

const closeButtonStyle = css`
  position: absolute;
  top: ${MODAL.closeOffset};
  right: ${MODAL.closeOffset};

  display: grid;
  place-items: center;

  width: ${MODAL.closeSize};
  height: ${MODAL.closeSize};
  padding: 0;

  color: ${color.icon.default};

  background: transparent;
  border: 0;
  border-radius: ${MODAL.closeRadius};
  cursor: pointer;

  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    color: ${color.text.primary};
    background: ${color.background.subtle};
  }

  &:active {
    background: ${color.background.subtle};
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

const labelWithDescriptionStyle = css`
  margin: 0 40px 6px 0;
  color: ${color.text.primary};
  letter-spacing: -0.5px;
`;

const descriptionStyle = css`
  margin: 0 0 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${typography.caption};
  color: ${color.text.secondary};
`;
