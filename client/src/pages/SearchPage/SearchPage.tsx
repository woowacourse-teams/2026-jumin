import { css } from '@emotion/css';
import type { Destination } from '../../../api/contracts';
import { BottomNav } from '../../../shared/components/service/BottomNav';
import { SearchContent } from './components/SearchContent';
import { color } from '../../theme/color';
import { useStepNavigation } from '../../../shared/hooks/useStepNavigation';

export const SearchPage = () => {
  const { move } = useStepNavigation('search');

  const handleDestinationSelect = (destination: Destination) => {
    const params = new URLSearchParams({
      lat: String(destination.latitude),
      lng: String(destination.longitude),
      name: destination.name,
    });

    move('SELECT_DESTINATION', undefined, { search: `?${params.toString()}` });
  };

  return (
    <main className={pageStyle}>
      <SearchContent onDestinationSelect={handleDestinationSelect} />
      <footer
        className={css`
          margin-top: auto;
          position: relative;
          flex-shrink: 0;
          height: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px));
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
  background-color: ${color.background.default};
`;
