import { useMemo } from 'react';
import { addHours } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { parkingSearchQueryOptions } from '../../../../api/queries/parkingSearchQuery';
import candidateParkingMarkerUrl from '../../../../assets/icons/markers/defaultRecommandMarker.svg';
import recommendedParkingMarkerUrl from '../../../../assets/icons/markers/unselectedRecommandMarker.svg';
import { NaverMapMarker } from '../../../../shared/maps/NaverMapMarker';
import { SearchRadiusCircle } from '../../../../shared/maps/SearchRadiusCircle';
import { DestinationMapOverlay } from '../../../../shared/components/DestinationMapOverlay';
import { createRoundedCurrentDate } from '../../ParkingSetupPage/model/time';
import { formatOffsetDateTime } from '../../ParkingSetupPage/utils/timeFormat';

interface Props {
  map: naver.maps.Map | null;
  searchCenter: {
    latitude: number;
    longitude: number;
  };
  showSearchCenterMarker: boolean;
}

const parkingMarkerIcons = {
  recommended: {
    url: recommendedParkingMarkerUrl,
    width: 50,
    height: 61,
    anchorX: 25,
    anchorY: 49.5,
  },
  candidate: {
    url: candidateParkingMarkerUrl,
    width: 20,
    height: 20,
    anchorX: 10,
    anchorY: 10,
  },
};

export const NearbyParkingMarkers = ({ map, searchCenter, showSearchCenterMarker }: Props) => {
  // 검색 시간 생성
  const searchCondition = useMemo(() => {
    const { entryAt } = createRoundedCurrentDate();
    const exitAt = addHours(entryAt, 1);

    return {
      destinationLatitude: searchCenter.latitude,
      destinationLongitude: searchCenter.longitude,
      entryAt: formatOffsetDateTime(entryAt),
      exitAt: formatOffsetDateTime(exitAt),
    };
  }, [searchCenter.latitude, searchCenter.longitude]);
  // useQuery 호출

  const { data } = useQuery(parkingSearchQueryOptions(searchCondition));

  if (!map) return null;

  const availableParkingLots = [...(data?.parkingLots ?? [])]
    .filter((parkingLot) => parkingLot.availabilityStatus === 'AVAILABLE')
    .sort((first, second) => first.distanceMeters - second.distanceMeters || first.id - second.id);

  const recommendedParkingLotIds = availableParkingLots
    .slice(0, 3)
    .map((parkingLot) => parkingLot.id);

  return (
    <>
      {showSearchCenterMarker ? (
        <DestinationMapOverlay
          map={map}
          latitude={searchCenter.latitude}
          longitude={searchCenter.longitude}
          title="주차장 검색 위치"
        />
      ) : (
        <SearchRadiusCircle
          map={map}
          latitude={searchCenter.latitude}
          longitude={searchCenter.longitude}
        />
      )}
      {availableParkingLots.map((parkingLot) => {
        const isRecommended = recommendedParkingLotIds.includes(parkingLot.id);

        return (
          <NaverMapMarker
            key={parkingLot.id}
            map={map}
            latitude={parkingLot.location.latitude}
            longitude={parkingLot.location.longitude}
            icon={isRecommended ? parkingMarkerIcons.recommended : parkingMarkerIcons.candidate}
            title={parkingLot.name}
            zIndex={isRecommended ? 20 : 10}
          />
        );
      })}
    </>
  );
};
