import { css } from '@emotion/css';

import type { Destination } from '../../../../api/contracts';
import destinationMarkerUrl from '../../../../assets/icons/markers/destinationMarker.svg';
import { SearchBar } from '../../../../shared/components/SearchBar';
import type { ParkingSearchCondition, ParkingSetupView } from '../../../../shared/types/navigation';
import { createRoundedCurrentDate, formatOffsetDateTime } from '../../../../shared/utils/time';
import { DestinationConfirmSheet } from './DestinationConfirmSheet';
import { useParkingSetupDestination } from '../hooks/useParkingSetupDestination';
import { addHours } from 'date-fns';

interface Props {
  map: naver.maps.Map | null;
  destination: Destination;
  setupView?: ParkingSetupView;
  onSetupViewChange: (view: ParkingSetupView) => void;
  onSearch: () => void;
  onRecommend: (searchCondition: ParkingSearchCondition) => void;
}

export const ParkingSetupContent = ({
  map,
  destination,
  setupView,
  onSetupViewChange,
  onSearch,
  onRecommend,
}: Props) => {
  const { selectedLocation, destinationName, hasMovedMap, isFetching, isError } =
    useParkingSetupDestination({ destination, map, setupView, onSetupViewChange });

  const handleRecommend = () => {
    const entryAt = createRoundedCurrentDate();

    onRecommend({
      destinationName,
      destinationLatitude: selectedLocation.latitude,
      destinationLongitude: selectedLocation.longitude,
      entryAt: formatOffsetDateTime(entryAt),
      exitAt: formatOffsetDateTime(addHours(entryAt, 1)),
    });
  };

  return (
    <main>
      <img className={fixedPinStyle} src={destinationMarkerUrl} alt="" draggable={false} />

      <div className={searchBarWrapperStyle}>
        <SearchBar onClick={onSearch} />
      </div>

      <DestinationConfirmSheet
        name={destinationName}
        address={hasMovedMap ? undefined : (destination.roadAddress ?? destination.address)}
        nextDisabled={hasMovedMap && (isFetching || isError)}
        onCancel={onSearch}
        onNext={handleRecommend}
      />
    </main>
  );
};

const searchBarWrapperStyle = css`
  position: relative;
  z-index: 1;
  width: 100%;
`;

const fixedPinStyle = css`
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;

  width: 30px;
  height: 30px;

  pointer-events: none;
  transform: translate(-50%, -100%);
`;
