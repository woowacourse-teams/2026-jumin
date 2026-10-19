import { css } from '@emotion/css';
import type { Destination } from '../../../../api/contracts';
import { RecentSearchRow } from './RecentSearchRow';
import { color } from '../../../theme/color';
import { fontWeight } from '../../../theme/font';
import { typography } from '../../../theme/typography';

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
        padding: 16px 24px 8px;
      `}
    >
      <h2
        className={css`
          margin: 0;
          ${typography.caption};
          color: ${color.text.primary};
          font-weight: ${fontWeight[700]};
        `}
      >
        최근 검색
      </h2>
      <button
        className={css`
          padding: 0;
          border: 0;
          background: transparent;
          ${typography.caption};
          color: ${color.text.secondary};
          cursor: pointer;
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
