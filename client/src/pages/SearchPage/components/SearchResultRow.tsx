import { css } from '@emotion/css';
import type { Destination } from '../../../../api/contracts';
import { color } from '../../../theme/color';
import { fontSize } from '../../../theme/font';
import { typography } from '../../../theme/typography';

interface Props {
  query: string;
  destination: Destination;
  onSelect: (destination: Destination) => void;
}

export const SearchResultRow = ({ query, destination, onSelect }: Props) => {
  const matchIndex = destination.name.indexOf(query);

  return (
    <li
      className={css`
        border-bottom: 1px solid ${color.border.default};
      `}
    >
      <button
        className={css`
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          min-height: 66px;
          padding: 10px 20px;
          border: 0;
          background: ${color.background.default};
          text-align: left;
          cursor: pointer;

          &:hover,
          &:focus-visible {
            background: ${color.background.subtle};
          }
        `}
        type="button"
        onClick={() => onSelect(destination)}
      >
        <span
          className={css`
            display: grid;
            width: 32px;
            height: 32px;
            flex-shrink: 0;
            place-items: center;
            border-radius: 10px;
            background: ${color.background.brandSubtle};
            color: ${color.text.brand};
            font-size: ${fontSize[16]};
          `}
          aria-hidden="true"
        >
          ⌖
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
              ${typography.bodySmallStrong};
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
              destination.name
            ) : (
              <>
                {destination.name.slice(0, matchIndex)}
                <mark>{destination.name.slice(matchIndex, matchIndex + query.length)}</mark>
                {destination.name.slice(matchIndex + query.length)}
              </>
            )}
          </strong>
          <span
            className={css`
              overflow: hidden;
              ${typography.caption};
              color: ${color.text.secondary};
              text-overflow: ellipsis;
              white-space: nowrap;
            `}
          >
            {destination.roadAddress ?? destination.address}
          </span>
        </span>
      </button>
    </li>
  );
};
