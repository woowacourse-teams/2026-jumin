import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

export const useNearbyParkingNavigation = () => {
  const navigate = useNavigate();
  const isMountedRef = useRef(true);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const navigateToNearbyParking = () => {
    if (!navigator.geolocation) {
      window.alert('현재 위치를 지원하지 않는 브라우저예요.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!isMountedRef.current) return;

        setIsLocating(false);
        navigate('/parkingsetup', {
          state: {
            destination: {
              name: '현재 위치',
              latitude: coords.latitude,
              longitude: coords.longitude,
            },
          },
        });
      },
      () => {
        if (!isMountedRef.current) return;

        setIsLocating(false);
        window.alert('현재 위치를 가져오지 못했어요. 위치 권한을 확인해 주세요.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return {
    isLocating,
    navigateToNearbyParking,
  };
};
