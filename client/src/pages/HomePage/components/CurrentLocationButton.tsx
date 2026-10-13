import { css } from '@emotion/css';
import currentLocationButtonIcon from '../../../../assets/icons/CurrentLocationButtonIcon.svg';

interface Props {
  onClick: () => void;
}

export const CurrentLocationButton = ({ onClick }: Props) => (
  <button
    className={css`
      display: inline-flex;
      padding: 0;
      border: 0;
      border-radius: 14px;
      background: transparent;
      vertical-align: top;
      cursor: pointer;
      box-shadow: 5px 5px 15px rgba(0, 0, 0, 0.3);
    `}
    type="button"
    aria-label="현재 위치로 이동"
    onClick={onClick}
  >
    <img
      className={css`
        display: block;
        pointer-events: none;
        user-select: none;
      `}
      src={currentLocationButtonIcon}
      alt=""
      draggable={false}
    />
  </button>
);
