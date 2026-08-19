import { css } from '@emotion/css';
import type { Destination } from '../../../../api/contracts';
import { SearchResultRow } from './SearchResultRow';

interface Props {
  query: string;
  searchResults: Destination[];
  isSearching: boolean;
  errorMessage: string;
  onSelect: (destination: Destination) => void;
}

export const SearchResultList = ({ query, searchResults, isSearching, errorMessage, onSelect }: Props) => {
  const message =
    query.length < 2
      ? '검색어를 2글자 이상 입력해 주세요.'
      : isSearching
        ? '검색 중...'
        : errorMessage || (searchResults.length === 0 ? '검색 결과가 없습니다.' : '');

  return (
    <section
      className={css`
        min-height: 0;
        flex: 1;
        overflow-y: auto;
      `}
      aria-live="polite"
    >
      {message ? (
        <p
          className={css`
            margin: 32px 20px;
            color: #98a2b3;
            font-size: 13px;
            text-align: center;
          `}
        >
          {message}
        </p>
      ) : (
        <ul
          className={css`
            margin: 16px 0 0;
            padding: 0;
            list-style: none;
          `}
        >
          {searchResults.map((destination) => (
            <SearchResultRow
              key={destination.destinationId}
              query={query}
              destination={destination}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </section>
  );
};
