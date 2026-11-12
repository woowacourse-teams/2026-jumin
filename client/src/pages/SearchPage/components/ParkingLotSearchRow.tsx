import { css } from '@emotion/css';
import type { ParkingLotSearchResult } from '../../../api/contracts';
import { ParkingIcon } from '../../../shared/components/ui/icons';
import { color } from '../../../theme/color';
import { duration, easing } from '../../../theme/motion';
import { radius } from '../../../theme/radius';
import { typography } from '../../../theme/typography';

interface Props {
  query: string;
  parkingLot: ParkingLotSearchResult;
  onSelect: (parkingLot: ParkingLotSearchResult) => void;
}

export const ParkingLotSearchRow = ({ query, parkingLot, onSelect }: Props) => {
  const matchIndex = parkingLot.name.toLowerCase().indexOf(query.toLowerCase());

  return (
    <li
      className={css`
        border-bottom: 1px solid ${color.border.default};
      `}
    >
      <button
        type="button"
        onClick={() => onSelect(parkingLot)}
        className={css`
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          min-height: 76px;
          padding: 12px 20px;
          border: 0;
          background: ${color.background.default};
          text-align: left;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: background-color ${duration.fast} ${easing.out};

          &:focus-visible,
          &:hover {
            background: ${color.background.subtle};
          }

          &:active {
            background: ${color.background.pressed};
          }
        `}
      >
        <span
          className={css`
            display: grid;
            width: 40px;
            height: 40px;
            flex-shrink: 0;
            place-items: center;
            border-radius: ${radius.sm};
            background: ${color.background.brandSubtle};
            color: ${color.text.brand};
          `}
          aria-hidden="true"
        >
          <ParkingIcon size={18} />
        </span>
        <span
          className={css`
            display: flex;
            min-width: 0;
            flex-direction: column;
            gap: 3px;
          `}
        >
          <strong
            className={css`
              overflow: hidden;
              ${typography.bodyStrong};
              color: ${color.text.primary};
              text-overflow: ellipsis;
              white-space: nowrap;

              mark {
                background: transparent;
                color: ${color.text.brand};
              }
            `}
          >
            {matchIndex < 0 ? (
              parkingLot.name
            ) : (
              <>
                {parkingLot.name.slice(0, matchIndex)}
                <mark>{parkingLot.name.slice(matchIndex, matchIndex + query.length)}</mark>
                {parkingLot.name.slice(matchIndex + query.length)}
              </>
            )}
          </strong>
          {parkingLot.address && (
            <span
              className={css`
                overflow: hidden;
                ${typography.bodySmall};
                color: ${color.text.secondary};
                text-overflow: ellipsis;
                white-space: nowrap;
              `}
            >
              {parkingLot.address}
            </span>
          )}
        </span>
      </button>
    </li>
  );
};
