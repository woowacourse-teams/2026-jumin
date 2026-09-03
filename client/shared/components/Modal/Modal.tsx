import { css } from '@emotion/css';
import ReactModal from 'react-modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}

export const Modal = ({ isOpen, onClose, label, children }: Props) => {
  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel={label}
      overlayClassName={overlayStyle}
      className={modalStyle}
      shouldCloseOnOverlayClick
    >
      <h2 className={labelStyle}>{label}</h2>

      <button
        type="button"
        className={closeButtonStyle}
        aria-label={`${label} 닫기`}
        onClick={onClose}
      >
        x
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

  padding: 20px;
  box-sizing: border-box;

  background: rgb(16 27 55 / 48%);
`;

const modalStyle = css`
  position: relative;

  width: min(100%, 340px);
  padding: 26px 20px 18px;
  box-sizing: border-box;

  color: #18233d;
  background: #fff;
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

  color: #7f8a9f;
  font-family: inherit;
  font-size: 26px;
  line-height: 1;

  background: transparent;
  border: 0;
  border-radius: 10px;
  cursor: pointer;

  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    color: #18233d;
    background: #f5f6fb;
  }

  &:active {
    background: #e9ecf4;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
  }
`;

const labelStyle = css`
  margin: 0 44px 18px 0;

  color: #101b37;
  font-family: inherit;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.4;
  letter-spacing: -0.4px;
`;

const contentStyle = css`
  display: flex;
  flex-direction: column;
  align-items: center;
`;
