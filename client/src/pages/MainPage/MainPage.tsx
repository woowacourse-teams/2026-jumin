import { css } from '@emotion/css';
import { useNavigate } from 'react-router';
import SearchBar from '../../../shared/components/SearchBar';
import BottomNav from '../../../shared/components/BottomNav';
import CurrentLocationButton from './components/CurrentLocationButton';

export default function MainPage() {
  const navigate = useNavigate();
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
        <SearchBar onClick={() => navigate('/search')} />
        {/* 지도 */}
        <footer
          className={css`
            margin-top: auto;
            position: relative;
            flex-shrink: 0;
          `}
        >
          <CurrentLocationButton />
          <BottomNav />
        </footer>
      </div>
    </div>
  );
}
