import { css } from '@emotion/css';

import destinationMarkerUrl from '../../../../assets/icons/markers/destinationMarker.svg';
import { SearchBar } from '../../../../shared/components/service/destination/SearchBar';
import type { ParkingSearchCondition } from '../../../../shared/types/navigation';
import { createRoundedCurrentDate, formatOffsetDateTime } from '../../../../shared/utils/time';
import { DestinationConfirmSheet } from './DestinationConfirmSheet';
import { useParkingSetupDestination } from '../hooks/useParkingSetupDestination';
import { addHours } from 'date-fns';
import { useParkingSetupMap } from '../hooks/useParkingSetupMap';
import type { Coordinates, SetupDestination } from '../types/destination';

interface Props {
  map: naver.maps.Map | null;
  location: SetupDestination;
  onSelectedLocationChange: (location: Coordinates) => void;
  onSearch: () => void;
  onRecommend: (searchCondition: ParkingSearchCondition) => void;
}

export const ParkingSetupContent = ({
  map,
  location,
  onSelectedLocationChange,
  onSearch,
  onRecommend,
}: Props) => {
  const { destinationName, isFetching, isError } = useParkingSetupDestination({
    selectedLocation: location,
  });

  useParkingSetupMap({
    map,
    selectedLocation: location,
    onDragEnd: onSelectedLocationChange,
  });

  const handleRecommend = () => {
    // 입차 시간을 현재 시각에서 가까운 10분단위 시각으로 설정 (출차는 +1시간)
    const entryAt = createRoundedCurrentDate();

    onRecommend({
      destinationName,
      destinationLatitude: location.latitude,
      destinationLongitude: location.longitude,
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
        nextDisabled={isFetching || isError}
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
