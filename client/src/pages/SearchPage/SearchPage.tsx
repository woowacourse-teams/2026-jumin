import { css } from '@emotion/css';
import { useEffect, useState } from 'react';
import type { Destination, DestinationSearchResponse } from '../../../api/contracts';
import SearchBar from '../../../shared/components/SearchBar';
import BottomNav from '../../../shared/components/BottomNav';
import { RecentSearchList } from './components/RecentSearchList';
import { SearchResultList } from './components/SearchResultList';

const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<Destination[]>([]);
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

    searchDestinations();

    return () => abortController.abort();
  }, [normalizedQuery]);

  const selectRecentSearch = (destination: Destination) => {
    setQuery(destination.name);
  };

  const removeRecentSearch = (destinationId: string) => {
    setRecentSearches((current) => current.filter((destination) => destination.destinationId !== destinationId));
  };

  return (
    <div
      className={css`
        width: 390px;
        height: 844px;
        margin: 0 auto;
        overflow: hidden;
        box-sizing: border-box;
        border-radius: 28px;
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
        <SearchBar autoFocus value={query} onChange={(event) => setQuery(event.target.value)} />

        {normalizedQuery ? (
          <SearchResultList
            query={normalizedQuery}
            searchResults={searchResults}
            isSearching={isSearching}
            errorMessage={searchError}
            onSelect={selectRecentSearch}
          />
        ) : (
          <RecentSearchList
            recentSearches={recentSearches}
            onSelect={selectRecentSearch}
            onRemove={removeRecentSearch}
            onClear={() => setRecentSearches([])}
          />
        )}

        <footer
          className={css`
            margin-top: auto;
            position: relative;
            flex-shrink: 0;
          `}
        >
          <BottomNav />
        </footer>
      </div>
    </div>
  );
};

export default SearchPage;
