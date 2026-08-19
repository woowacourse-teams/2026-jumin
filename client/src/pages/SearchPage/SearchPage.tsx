import { css } from '@emotion/css';
import { useState } from 'react';
import type { Destination } from '../../../api/contracts';
import SearchBar from '../../../shared/components/SearchBar';
import BottomNav from '../../../shared/components/BottomNav';
import { RecentSearchList } from './components/RecentSearchList';

const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<Destination[]>([]);

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

        <RecentSearchList
          recentSearches={recentSearches}
          onSelect={selectRecentSearch}
          onRemove={removeRecentSearch}
          onClear={() => setRecentSearches([])}
        />

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
