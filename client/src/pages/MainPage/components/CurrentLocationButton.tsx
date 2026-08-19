import { css } from '@emotion/css';
import currentLocationButtonIcon from '../../../../assets/icons/CurrentLocationButtonIcon.svg';

export const CurrentLocationButton = () => (
  <div
    className={css`
      position: absolute;
      right: 16px;
      bottom: calc(100% + 16px);
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
