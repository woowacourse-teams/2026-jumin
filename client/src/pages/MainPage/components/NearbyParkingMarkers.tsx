import { useMemo } from 'react';
import { addOneHour, createRoundedCurrentTime } from '../../ParkingSetupPage/model/time';
import { createSearchPeriod } from '../../ParkingSetupPage/model/searchCondition';
import { useQuery } from '@tanstack/react-query';
import { parkingSearchQueryOptions } from '../../../../api/queries/parkingSearchQuery';

import defaultParkingMarkerUrl from '../../../../assets/icons/markers/defaultRecommandMarker.svg';
import { NaverMapMarker } from '../../../../shared/maps/NaverMapMarker';
import { SearchRadiusCircle } from '../../../../shared/maps/SearchRadiusCircle';

interface Props {
  map: naver.maps.Map | null;
  currentLocation: {
    latitude: number;
    longitude: number;
  };
}

const parkingMarkerIcon = {
  url: defaultParkingMarkerUrl,
  width: 20,
  height: 20,
  anchorX: 10,
  anchorY: 10,
};

export const NearbyParkingMarkers = ({ map, currentLocation }: Props) => {
  // 검색 시간 생성
  const searchCondition = useMemo(() => {
    const entryTime = createRoundedCurrentTime();
    const exitTime = addOneHour(entryTime);

    const { entryAt, exitAt } = createSearchPeriod(new Date(), entryTime, exitTime);

    return {
      destinationLatitude: currentLocation.latitude,
      destinationLongitude: currentLocation.longitude,
      entryAt,
      exitAt,
    };
  }, [currentLocation.latitude, currentLocation.longitude]);
  // useQuery 호출

  const { data } = useQuery(parkingSearchQueryOptions(searchCondition));

  if (!map) return null;

  const availableParkingLots =
    data?.parkingLots.filter((parkingLot) => parkingLot.availabilityStatus === 'AVAILABLE') ?? [];

  return (
    <>
      <SearchRadiusCircle
        map={map}
        latitude={currentLocation.latitude}
        longitude={currentLocation.longitude}
      />
      {availableParkingLots.map((parkingLot) => (
        <NaverMapMarker
          key={parkingLot.id}
          map={map}
          latitude={parkingLot.location.latitude}
          longitude={parkingLot.location.longitude}
          icon={parkingMarkerIcon}
          title={parkingLot.name}
          zIndex={10}
        />
      ))}
    </>
  );
};
