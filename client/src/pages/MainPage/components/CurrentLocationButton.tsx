import { css } from '@emotion/css';
import currentLocationButtonIcon from '../../../../assets/icons/CurrentLocationButtonIcon.svg';

interface Props {
  onClick: () => void;
}

export const CurrentLocationButton = ({ onClick }: Props) => (
  <div
    className={css`
      position: absolute;
      right: 16px;
      bottom: calc(102px + env(safe-area-inset-bottom));
    `}
  >
    <button
      className={css`
        width: 74px;
        height: 74px;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
      `}
      type="button"
      aria-label="현재 위치로 이동"
      onClick={onClick}
    >
      <img
        className={css`
          display: block;
          width: 60px;
          height: 60px;
          pointer-events: none;
          user-select: none;
        `}
        src={currentLocationButtonIcon}
        alt=""
        draggable={false}
      />
    </button>
  </div>
);
