import { css } from '@emotion/css';
import { MyLocation } from '../../../shared/components/ui/icons';
import { color } from '../../../theme/color';
import { duration, easing, pressScale } from '../../../theme/motion';
import { radius } from '../../../theme/radius';
import { shadow } from '../../../theme/shadow';

interface Props {
  onClick: () => void;
}

export const CurrentLocationButton = ({ onClick }: Props) => (
  <button
    className={css`
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      padding: 0;
      border: 0;
      border-radius: ${radius.pill};
      color: ${color.icon.brand};
      background: ${color.background.default};
      vertical-align: top;
      cursor: pointer;
      box-shadow: ${shadow.floating};
      -webkit-tap-highlight-color: transparent;
      transition:
        transform ${duration.fast} ${easing.out},
        background-color ${duration.fast} ${easing.out};

      &:active {
        background: ${color.background.subtle};
        transform: scale(${pressScale});
      }
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
