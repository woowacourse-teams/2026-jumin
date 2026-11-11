import { Button } from '../../../shared/components/ui/Button';
import { Notice } from '../../../shared/components/ui/Notice';
import { css } from '@emotion/css';
import { CloseIcon } from '../../../shared/components/ui/icons';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';

interface Props {
  name: string;
  nextDisabled?: boolean;
  onCancel: () => void;
  onNext: () => void;
}

export const DestinationConfirmSheet = ({ name, nextDisabled, onCancel, onNext }: Props) => {
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
      <Notice className={mapGuideStyle}>지도를 움직여 목적지를 확정해주세요</Notice>
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
        aria-live="polite"
        aria-atomic="true"
        className={css`
          margin: 0 40px 4px 0;
          ${typography.titleCard};
          color: ${color.text.primary};
        `}
      >
        {name}
      </h1>

      <Button
        isFullWidth
        size="lg"
        className={nextButtonStyle}
        disabled={nextDisabled}
        onClick={onNext}
      >
        다음
      </Button>
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
`;

const nextButtonStyle = css`
  margin-top: 20px;
`;
