import { css } from '@emotion/css';
import type { Destination } from '../../../../api/contracts';

interface Props {
  destination: Destination;
  onSelect: (destination: Destination) => void;
  onRemove: (destinationId: string) => void;
}

export const RecentSearchRow = ({ destination, onSelect, onRemove }: Props) => (
  <li
    className={css`
      display: flex;
      align-items: center;
      min-height: 66px;
      border-bottom: 1px solid #eef2f6;
    `}
  >
    <button
      className={css`
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        padding: 10px 0 10px 20px;
        flex: 1;
        border: 0;
        background: transparent;
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
          width: 20px;
          flex-shrink: 0;
          color: #aab4c2;
          font-size: 18px;
          text-align: center;
        `}
        aria-hidden="true"
      >
        ◷
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
          `}
        >
          {destination.name}
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
    <button
      className={css`
        width: 44px;
        height: 44px;
        margin-right: 6px;
        flex-shrink: 0;
        border: 0;
        background: transparent;
        color: #aab4c2;
        font-size: 20px;
        cursor: pointer;
      `}
      type="button"
      aria-label={`${destination.name} 삭제`}
      onClick={() => onRemove(destination.destinationId)}
    >
      ×
    </button>
  </li>
);
