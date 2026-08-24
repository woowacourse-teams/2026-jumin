import { css } from '@emotion/css';
import { useNavigate } from 'react-router';
import { SearchBar } from '../../../shared/components/SearchBar';
import { BottomNav } from '../../../shared/components/BottomNav';
import { CurrentLocationButton } from './components/CurrentLocationButton';
import { NaverMap } from '../../../shared/components/NaverMap';

export const MainPage = () => {
  const navigate = useNavigate();
  return (
    <div
      className={css`
        position: relative;
        width: 390px;
        height: 844px;
        margin: 0 auto;
        overflow: hidden;
        box-sizing: border-box;
        border-radius: 28px;
      `}
    >
      <NaverMap />
      <div
        className={css`
          position: relative;
          z-index: 1;
          width: 100%;
        `}
      >
        <SearchBar onClick={() => navigate('/search')} />
      </div>
      <footer
        className={css`
          position: absolute;
          right: 0;
          bottom: 0;
          left: 0;
          z-index: 1;
        `}
      >
        <CurrentLocationButton />
        <BottomNav />
      </footer>
    </div>
  );
};
