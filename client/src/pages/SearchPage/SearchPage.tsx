import { css } from '@emotion/css';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Destination, DestinationSearchResponse } from '../../../api/contracts';
import { SearchBar } from '../../../shared/components/SearchBar';
import { BottomNav } from '../../../shared/components/BottomNav';
import { RecentSearchList } from './components/RecentSearchList';
import { SearchResultList } from './components/SearchResultList';

const RECENT_SEARCHES_KEY = 'recentSearches';
const SEARCH_DEBOUNCE_DELAY = 300;

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

export const SearchPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<Destination[]>(loadRecentSearches);
  const [searchResults, setSearchResults] = useState<Destination[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const normalizedQuery = query.trim();

  useEffect(() => {
    if (normalizedQuery.length < 2) return;

    const abortController = new AbortController();

    const searchDestinations = async () => {
      setIsSearching(true);
      setSearchError('');

      try {
        const response = await fetch(`/api/destinations/search?query=${encodeURIComponent(normalizedQuery)}`, {
          signal: abortController.signal,
        });

        if (!response.ok) throw new Error();

        const data: DestinationSearchResponse = await response.json();
        setSearchResults(data.destinations);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;

        setSearchResults([]);
        setSearchError('검색 결과를 불러오지 못했습니다.');
      } finally {
        if (!abortController.signal.aborted) setIsSearching(false);
      }
    };

    const timerId = window.setTimeout(() => {
      void searchDestinations();
    }, SEARCH_DEBOUNCE_DELAY);

    return () => {
      window.clearTimeout(timerId);
      abortController.abort();
    };
  }, [normalizedQuery]);

  const updateRecentSearches = (nextRecentSearches: Destination[]) => {
    setRecentSearches(nextRecentSearches);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextRecentSearches));
  };

  const selectDestination = (destination: Destination) => {
    const nextRecentSearches = [
      destination,
      ...recentSearches.filter((recentSearch) => recentSearch.destinationId !== destination.destinationId),
    ].slice(0, 5);

    updateRecentSearches(nextRecentSearches);
    navigate('/parkingsetup', { state: { destination } });
  };

  const removeRecentSearch = (destinationId: string) => {
    updateRecentSearches(recentSearches.filter((destination) => destination.destinationId !== destinationId));
  };

  return (
    <div
      className={css`
        width: 100%;
        height: 100%;
        overflow: hidden;
        background-color: #ffffff;
      `}
    >
      <div
        className={css`
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
        `}
      >
        <SearchBar
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearchResults([]);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || isSearching || !searchResults[0]) return;

            event.preventDefault();
            selectDestination(searchResults[0]);
          }}
        />

        {normalizedQuery ? (
          <SearchResultList
            query={normalizedQuery}
            searchResults={searchResults}
            isSearching={isSearching}
            errorMessage={searchError}
            onSelect={selectDestination}
          />
        ) : (
          <RecentSearchList
            recentSearches={recentSearches}
            onSelect={selectDestination}
            onRemove={removeRecentSearch}
            onClear={() => updateRecentSearches([])}
          />
        )}

        <footer
          className={css`
            margin-top: auto;
            position: relative;
            flex-shrink: 0;
            height: calc(86px + env(safe-area-inset-bottom));
          `}
        >
          <BottomNav />
        </footer>
      </div>
    </div>
  );
};
