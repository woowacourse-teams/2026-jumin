import { css } from '@emotion/css';
import type { Destination } from '../../../../api/contracts';
import { SearchResultRow } from './SearchResultRow';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';
import { SEARCH_MESSAGES } from '../searchMessages';

interface Props {
  query: string;
  searchResults: Destination[];
  isSearching: boolean;
  errorMessage: string;
  onSelect: (destination: Destination) => void;
}

export const SearchResultList = ({
  query,
  searchResults,
  isSearching,
  errorMessage,
  onSelect,
}: Props) => {
  const getMessage = () => {
    if (query.length < 2) return SEARCH_MESSAGES.queryTooShort;
    if (isSearching) return SEARCH_MESSAGES.searching;
    if (errorMessage) return errorMessage;
    if (searchResults.length === 0) return SEARCH_MESSAGES.noSearchResults;

    return '';
  };
  const message = getMessage();
  const isErrorMessage = query.length >= 2 && !isSearching && Boolean(errorMessage);

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
            ${typography.bodySmall};
            color: ${isErrorMessage ? color.text.error : color.text.secondary};
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
