import { css } from '@emotion/css';
import type { Destination } from '../../../../api/contracts';

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
        border-bottom: 1px solid #eef2f6;
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
          background: white;
          text-align: left;
          cursor: pointer;

          &:hover,
          &:focus-visible {
            background: #f7f9fc;
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
            background: #eff4ff;
            color: #155eef;
            font-size: 16px;
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
              color: #24334b;
              font-size: 14px;
              line-height: 1.35;
              text-overflow: ellipsis;
              white-space: nowrap;

              mark {
                background: transparent;
                color: #155eef;
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
              color: #98a2b3;
              font-size: 11px;
              line-height: 1.35;
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
