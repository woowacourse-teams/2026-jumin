import { css } from '@emotion/css';
import { useQuery } from '@tanstack/react-query';
import { Destination } from '../../../../api/contracts';
import { useEffect, useState } from 'react';
import { destinationSearchQueryOptions } from '../../../../api/queries/destinationSearchQuery';
import { SearchBar } from '../../../../shared/components/SearchBar';
import { SearchResultList } from './SearchResultList';
import { RecentSearchList } from './RecentSearchList';

const RECENT_SEARCHES_KEY = 'recentSearches';
const SEARCH_DEBOUNCE_DELAY = 300;

interface Props {
  onDestinationSelect: (destination: Destination) => void;
}

const loadRecentSearches = (): Destination[] => {
  try {
    const storedRecentSearches = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!storedRecentSearches) return [];

    const parsedRecentSearches: unknown = JSON.parse(storedRecentSearches);
    return Array.isArray(parsedRecentSearches) ? (parsedRecentSearches as Destination[]) : [];
  } catch {
    return [];
  }
};

const useDebouncedValue = <T,>(value: T, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [value, delay]);

  return debouncedValue;
};

export const SearchContent = ({ onDestinationSelect }: Props) => {
  const [query, setQuery] = useState('');

  // 최근 목적지 검색 기록
  const [recentSearches, setRecentSearches] = useState<Destination[]>(loadRecentSearches);

  // 최근 검색 목록을 업데이트
  const updateRecentSearches = (nextRecentSearches: Destination[]) => {
    setRecentSearches(nextRecentSearches);

    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextRecentSearches));
  };

  // 최근 검색 목록 하나만 제거
  const removeRecentSearch = (destinationId: string) => {
    updateRecentSearches(
      recentSearches.filter((destination) => destination.destinationId !== destinationId),
    );
  };

  // 목적지 선택
  const selectDestination = (destination: Destination) => {
    const nextRecentSearches = [
      destination,
      ...recentSearches.filter(
        (recentSearch) => recentSearch.destinationId !== destination.destinationId,
      ),
    ].slice(0, 5);

    updateRecentSearches(nextRecentSearches);
  };

  const normalizedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(normalizedQuery, SEARCH_DEBOUNCE_DELAY);

  const { data, isFetching, isError, error } = useQuery(
    destinationSearchQueryOptions({
      query: debouncedQuery,
    }),
  );

  const isDebouncing = normalizedQuery.length >= 2 && normalizedQuery !== debouncedQuery;

  const isSearching = isDebouncing || isFetching;

  // 새 검색어를 입력하는 동안 이전 검색 결과가
  // 잠깐 표시되지 않도록 한다.
  const searchResults = isDebouncing ? [] : (data?.destinations ?? []);

  const errorMessage =
    !isDebouncing && isError
      ? error instanceof Error
        ? error.message
        : '검색 결과를 불러오지 못했습니다.'
      : '';

  const handleEnter = () => {
    if (isSearching || !searchResults[0]) {
      return;
    }

    handleSelect(searchResults[0]);
  };

  const handleSelect = (destination: Destination) => {
    selectDestination(destination);
    onDestinationSelect(destination);
  };

  return (
    <div
      className={css`
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 0;
      `}
    >
      <SearchBar
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') {
            return;
          }

          event.preventDefault();
          handleEnter();
        }}
      />
      {normalizedQuery ? (
        <SearchResultList
          query={normalizedQuery}
          searchResults={searchResults}
          isSearching={isSearching}
          errorMessage={errorMessage}
          onSelect={handleSelect}
        />
      ) : (
        <RecentSearchList
          recentSearches={recentSearches}
          onSelect={handleSelect}
          onRemove={removeRecentSearch}
          onClear={() => updateRecentSearches([])}
        />
      )}
    </div>
  );
};
