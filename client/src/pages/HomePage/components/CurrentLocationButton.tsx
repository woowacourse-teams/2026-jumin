import { css } from '@emotion/css';
import { MyLocation } from '../../../../shared/components/ui/icons';
import { color } from '../../../theme/color';

interface Props {
  onClick: () => void;
}

export const CurrentLocationButton = ({ onClick }: Props) => (
  <button
    className={css`
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 46px;
      height: 46px;
      padding: 0;
      border: 0;
      border-radius: 14px;
      color: ${color.icon.brand};
      background: ${color.background.default};
      vertical-align: top;
      cursor: pointer;
      box-shadow: 5px 5px 15px rgba(0, 0, 0, 0.3);
    `}
    type="button"
    aria-label="현재 위치로 이동"
    onClick={onClick}
  >
    <MyLocation
      size={22}
      className={css`
        display: block;
        pointer-events: none;
        user-select: none;
      `}
      aria-hidden="true"
    />
  </button>
);
