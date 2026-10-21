import { css } from '@emotion/css';
import { CloseIcon } from '../../../../shared/components/ui/icons';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';

interface Props {
  name: string;
  address?: string;
  nextDisabled?: boolean;
  onCancel: () => void;
  onNext: () => void;
}

export const DestinationConfirmSheet = ({
  name,
  address,
  nextDisabled,
  onCancel,
  onNext,
}: Props) => {
  return (
    <section
      className={css`
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        z-index: 1;
        padding: 24px 16px max(20px, env(safe-area-inset-bottom, 0px));
        border-radius: 28px 28px 0 0;
        background: ${color.background.default};
        box-sizing: border-box;
      `}
      aria-label="선택한 목적지"
    >
      <p className={mapGuideStyle} role="status" aria-live="polite">
        지도를 움직여 목적지를 확정해주세요
      </p>
      <button
        className={css`
          position: absolute;
          top: 16px;
          right: 16px;
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          padding: 0;
          border: 0;
          background: transparent;
          color: ${color.icon.default};
          cursor: pointer;
        `}
        type="button"
        aria-label="목적지 선택 취소"
        onClick={onCancel}
      >
        <CloseIcon size={24} aria-hidden="true" />
      </button>

      <h1
        className={css`
          margin: 0 40px 4px 0;
          ${typography.titleCard};
          color: ${color.text.primary};
        `}
      >
        {name}
      </h1>
      {address && (
        <p
          className={css`
            margin: 0;
            overflow: hidden;
            ${typography.caption};
            color: ${color.text.secondary};
            text-overflow: ellipsis;
            white-space: nowrap;
          `}
        >
          {address}
        </p>
      )}

      <button
        className={css`
          width: 100%;
          height: 52px;
          margin-top: 20px;
          border: 0;
          border-radius: 12px;
          background: ${color.background.brand};
          color: ${color.text.inverse};
          ${typography.label};
          cursor: pointer;

          &:hover:not(:disabled),
          &:focus-visible:not(:disabled) {
            background: ${color.background.brandHovered};
          }

          &:active:not(:disabled) {
            background: ${color.background.brandPressed};
          }

          &:focus-visible {
            outline: 3px solid ${color.focus.ring};
            outline-offset: 3px;
          }

          &:disabled {
            color: ${color.text.disabled};
            background: ${color.background.disabled};
            cursor: not-allowed;
          }
        `}
        type="button"
        disabled={nextDisabled}
        onClick={onNext}
      >
        다음
      </button>
    </section>
  );
};

const mapGuideStyle = css`
  position: absolute;
  bottom: calc(100% + 16px);
  left: 50%;
  width: max-content;
  max-width: calc(100% - 32px);
  transform: translateX(-50%);
  z-index: 1;

  margin: 0;
  padding: 10px 16px;

  ${typography.label};
  color: ${color.text.primary};
  text-align: center;
  word-break: keep-all;

  background: rgb(255 255 255 / 94%);
  border-radius: 999px;
  box-shadow: 0 4px 12px rgb(16 27 55 / 16%);
`;
