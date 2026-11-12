import { Stack } from '../../shared/components/ui/Stack';
import { css } from '@emotion/css';
import type { Destination, ParkingLotSearchResult } from '../../api/contracts';
import { BottomNav } from '../../shared/components/service/BottomNav';
import { SearchContent } from './components/SearchContent';
import { color } from '../../theme/color';
import { STEP_PATH, useStepNavigation } from '../../shared/hooks/useStepNavigation';
import { Navigate } from 'react-router';
import { useCenterLocationQuery } from './hooks/useCenterLocationQuery';
import { buildQueryString } from '../../shared/hooks/useQueryParams';

export const SearchPage = () => {
  const { move } = useStepNavigation('search');
  const centerLocation = useCenterLocationQuery();

  const handleDestinationSelect = (destination: Destination) => {
    const queryString = buildQueryString({
      lat: String(destination.latitude),
      lng: String(destination.longitude),
      name: destination.name,
    });

    move('SELECT_DESTINATION', queryString);
  };

  const handleParkingSelect = (parkingLot: ParkingLotSearchResult) => {
    move(
      'SELECT_PARKING',
      buildQueryString({
        parkingLotId: parkingLot.parkingLotId,
        lat: parkingLot.latitude,
        lng: parkingLot.longitude,
      }),
    );
  };

  if (!centerLocation) return <Navigate to={STEP_PATH.home} replace />;

  return (
    <Stack as="main" className={pageStyle}>
      <SearchContent
        viewportLatitude={centerLocation.latitude}
        viewportLongitude={centerLocation.longitude}
        onDestinationSelect={handleDestinationSelect}
        onParkingSelect={handleParkingSelect}
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
    </Stack>
  );
};

const pageStyle = css`
  position: relative;
  z-index: 1;

  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: ${color.background.default};
`;
