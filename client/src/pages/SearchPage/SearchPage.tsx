import { css } from '@emotion/css';
import type { Destination } from '../../../api/contracts';
import { BottomNav } from '../../../shared/components/service/BottomNav';
import { SearchContent } from './components/SearchContent';
import { color } from '../../theme/color';
import { STEP_PATH, useStepNavigation } from '../../../shared/hooks/useStepNavigation';
import { Navigate } from 'react-router';
import { useCenterLocationQuery } from './hooks/useCenterLocationQuery';
import { buildQueryString } from '../../../shared/hooks/useQueryParams';

export const SearchPage = () => {
  const { move } = useStepNavigation('search');
  const centerLocation = useCenterLocationQuery();

  const handleDestinationSelect = (destination: Destination) => {
    const queryString = buildQueryString({
      lat: String(destination.latitude),
      lng: String(destination.longitude),
      name: destination.name,
    });

    move('SELECT_DESTINATION', undefined, { search: queryString });
  };

  if (!centerLocation) return <Navigate to={STEP_PATH.home} replace />;

  return (
    <main className={pageStyle}>
      <SearchContent
        viewportLatitude={centerLocation.latitude}
        viewportLongitude={centerLocation.longitude}
        onDestinationSelect={handleDestinationSelect}
      />
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
