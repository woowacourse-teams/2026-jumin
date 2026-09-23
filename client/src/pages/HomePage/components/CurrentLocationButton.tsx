import { css } from '@emotion/css';
import currentLocationButtonIcon from '../../../../assets/icons/CurrentLocationButtonIcon.svg';

interface Props {
  onClick: () => void;
}

export const CurrentLocationButton = ({ onClick }: Props) => (
  <div
    className={css`
      width: 54px;
      height: 54px;
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
      aria-label="현재 위치로 이동"
      onClick={onClick}
    >
      <img
        className={css`
          position: absolute;
          top: -2px;
          left: -6px;
          display: block;
          width: 67px;
          height: 67px;
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
