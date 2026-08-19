import { css } from '@emotion/css';
import { useState } from 'react';
import SearchBar from '../../../shared/components/SearchBar';
import BottomNav from '../../../shared/components/BottomNav';

export default function SearchPage() {
  const [query, setQuery] = useState('');

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
}
