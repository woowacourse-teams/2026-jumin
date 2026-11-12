import { css, cx, keyframes } from '@emotion/css';
import ReactModal from 'react-modal';
import { useId } from 'react';
import { Stack } from './Stack';
import { CloseIcon } from './icons';
import { color } from '../../../theme/color';
import { duration, easing } from '../../../theme/motion';
import { radius } from '../../../theme/radius';
import { shadow } from '../../../theme/shadow';
import { typography } from '../../../theme/typography';

const MODAL = {
  maxWidth: '340px',
  padding: '26px 20px 18px',
  radius: radius.lg,
  shadow: shadow.modal,
  zIndex: 2000,
  /** 닫기 버튼은 터치 영역 44px을 확보하고, 아이콘 중심은 모서리에서 32px에 둔다. */
  closeOffset: '10px',
  closeSize: '44px',
  closeRadius: radius.sm,
  closeIconSize: 24,
  /** 아래에서 올라오며 나타나는 거리. */
  enterOffset: '28px',
} as const;

const overlayEnter = keyframes`
  from { opacity: 0; }
`;

const modalEnter = keyframes`
  from {
    opacity: 0;
    transform: translateY(${MODAL.enterOffset});
  }
`;

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
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ReactModal
      isOpen
      onRequestClose={onClose}
      contentLabel={label}
      aria={{
        modal: true,
        labelledby: titleId,
        describedby: description ? descriptionId : undefined,
      }}
      overlayClassName={overlayStyle}
      className={modalStyle}
      shouldCloseOnOverlayClick
    >
      <h2 id={titleId} className={cx(labelStyle, description && labelWithDescriptionStyle)}>
        {label}
      </h2>
      {description && (
        <p id={descriptionId} className={descriptionStyle}>
          {description}
        </p>
      )}

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
  animation: ${overlayEnter} ${duration.base} ${easing.out};
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
  animation: ${modalEnter} ${duration.base} ${easing.out};
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
  transition:
    background-color ${duration.fast} ${easing.out},
    color ${duration.fast} ${easing.out};

  @media (hover: hover) {
    &:hover {
      color: ${color.text.primary};
      background: ${color.background.subtle};
    }
  }

  &:active {
    color: ${color.text.primary};
    background: ${color.background.pressed};
  }
`;

const labelStyle = css`
  margin: 0 48px 18px 0;

  ${typography.titleSection};
  color: ${color.text.primary};
  font-family: inherit;
  letter-spacing: -0.4px;
`;

const labelWithDescriptionStyle = css`
  margin: 0 48px 6px 0;
  color: ${color.text.primary};
  letter-spacing: -0.5px;
`;

const descriptionStyle = css`
  margin: 0 0 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${typography.bodySmall};
  color: ${color.text.secondary};
`;
