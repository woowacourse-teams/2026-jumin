import destinationMarkerUrl from '../../assets/icons/markers/destinationMarker.svg';
import { NaverMapMarker } from '../maps/NaverMapMarker';
import { SearchRadiusCircle } from '../maps/SearchRadiusCircle';

const destinationIcon = {
  url: destinationMarkerUrl,
  width: 30,
  height: 30,
  anchorX: 15,
  anchorY: 30,
};

interface Props {
  map: naver.maps.Map | null;
  latitude: number;
  longitude: number;
  title: string;
}

export const DestinationMapOverlay = ({ map, latitude, longitude, title }: Props) => {
  return (
    <>
      <SearchRadiusCircle map={map} latitude={latitude} longitude={longitude} />

      <NaverMapMarker
        map={map}
        latitude={latitude}
        longitude={longitude}
        icon={destinationIcon}
        title={title}
        zIndex={40}
      />
    </>
  );
};
