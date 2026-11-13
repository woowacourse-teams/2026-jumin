import { css } from '@emotion/css';
import type { Destination, ParkingLotSearchResult } from '../../../api/contracts';
import { SearchResultRow } from './SearchResultRow';
import { ParkingLotSearchRow } from './ParkingLotSearchRow';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';

interface Props {
  query: string;
  searchResults: Destination[];
  parkingResults: ParkingLotSearchResult[];
  isSearching: boolean;
  errorMessage: string;
  onSelect: (destination: Destination) => void;
  onParkingSelect: (parkingLot: ParkingLotSearchResult) => void;
}

export const SearchResultList = ({
  query,
  searchResults,
  parkingResults,
  isSearching,
  errorMessage,
  onSelect,
  onParkingSelect,
}: Props) => {
  const visibleParkingResults = parkingResults.slice(0, 3);
  const resultCount = visibleParkingResults.length + searchResults.length;
  const getMessage = () => {
    if (query.length < 2) return '검색어를 2글자 이상 입력해 주세요.';
    if (isSearching) return '검색중...';
    if (errorMessage) return errorMessage;
    if (resultCount === 0) return '검색 결과가 없습니다.';

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
      aria-label="목적지 검색 결과"
    >
      <p
        role="status"
        aria-atomic="true"
        className={
          message
            ? css`
                margin: 32px 20px;
                ${typography.bodySmall};
                color: ${isErrorMessage ? color.text.error : color.text.secondary};
                text-align: center;
              `
            : visuallyHiddenStyle
        }
      >
        {message || `검색 결과 ${resultCount}곳`}
      </p>
      {!message && (
        <>
          {visibleParkingResults.length > 0 && (
            <ul
              aria-label="연관 주차장"
              className={css`
                margin: 16px 0 0;
                padding: 0;
                list-style: none;

                & > li:last-child {
                  border-bottom: ${searchResults.length > 0 ? '0' : `1px solid ${color.border.default}`};
                }
              `}
            >
              {visibleParkingResults.map((parkingLot) => (
                <ParkingLotSearchRow
                  key={parkingLot.parkingLotId}
                  query={query}
                  parkingLot={parkingLot}
                  onSelect={onParkingSelect}
                />
              ))}
            </ul>
          )}
          {searchResults.length > 0 && (
            <ul
              className={css`
                margin: ${visibleParkingResults.length > 0 ? '0' : '16px 0 0'};
                padding: 0;
                border-top: ${
                  visibleParkingResults.length > 0 ? `6px solid ${color.border.default}` : '0'
                };
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
        </>
      )}
    </section>
  );
};

const visuallyHiddenStyle = css`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;
