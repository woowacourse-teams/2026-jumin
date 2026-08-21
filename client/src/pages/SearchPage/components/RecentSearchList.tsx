import { css } from '@emotion/css';
import type { Destination } from '../../../../api/contracts';
import { RecentSearchRow } from './RecentSearchRow';

interface Props {
  recentSearches: Destination[];
  onSelect: (destination: Destination) => void;
  onRemove: (destinationId: string) => void;
  onClear: () => void;
}

export const RecentSearchList = ({ recentSearches, onSelect, onRemove, onClear }: Props) => (
  <section
    className={css`
      min-height: 0;
      flex: 1;
      overflow-y: auto;
    `}
  >
    <div
      className={css`
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px 8px;
      `}
    >
      <h2
        className={css`
          margin: 0;
          color: #344054;
          font-size: 12px;
          font-weight: 600;
        `}
      >
        최근 검색
      </h2>
      <button
        className={css`
          padding: 0;
          border: 0;
          background: transparent;
          color: #98a2b3;
          cursor: pointer;
          font-size: 12px;
        `}
        type="button"
        onClick={onClear}
      >
        전체 삭제
      </button>
    </div>
    <ul
      className={css`
        margin: 0;
        padding: 0;
        list-style: none;
      `}
    >
      {recentSearches.map((destination) => (
        <RecentSearchRow
          key={destination.destinationId}
          destination={destination}
          onSelect={onSelect}
          onRemove={onRemove}
        />
      ))}
    </ul>
  </section>
);
