import { css } from '@emotion/css';
import { useNavigate } from 'react-router';
import type { Destination } from '../../../api/contracts';
import { BottomNav } from '../../../shared/components/BottomNav';
import { SearchContent } from './components/SearchContent';

export const SearchPage = () => {
  const navigate = useNavigate();

  const handleDestinationSelect = (destination: Destination) => {
    navigate('/parkingsetup', {
      state: { destination },
    });
  };

  return (
    <main className={pageStyle}>
      <SearchContent onDestinationSelect={handleDestinationSelect} />
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
    </main>
  );
};

const pageStyle = css`
  display: flex;
  flex-direction: column;

  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #ffffff;
`;
