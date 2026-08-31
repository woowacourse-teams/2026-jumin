import { useEffect, useState } from 'react';
import BottomSheet, { BottomSheetSnap } from '../../../shared/components/BottomSheet';
import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router';
import { Destination } from '../../../api/contracts';
import { SearchBar } from '../../../shared/components/SearchBar';
import { DestinationConfirmSheet } from './components/DestinationConfirmSheet';
import { SearchConditionBar } from '../../../shared/components/SearchConditionBar';
import { ParkingTimeSheet } from './components/ParkingTimeSheet';
import { createRoundedCurrentDate, ParkingPeriod } from './model/time';
import { validatePeriod } from './utils/validate';
import { formatOffsetDateTime } from './utils/timeFormat';
import { css } from '@emotion/css';
import destinationMarkerUrl from '../../../assets/icons/markers/destinationMarker.svg';
import { useQuery } from '@tanstack/react-query';
import { destinationNameQueryOptions } from '../../../api/queries/destinationNameQuery';
// 목적지 확인, 입출차 시간 입력 step
type ParkingSetupStep = 'destination' | 'time';

interface MapLocation {
  latitude: number;
  longitude: number;
}

// 검색에서 넘어온 state 인터페이스
interface NavigationState {
  destination?: Destination;
}

export const ParkingSetupPage = () => {
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('expanded');

  // 검색 페이지에서 받아오는 state에서 destination이 존재하는지 확인
  const { state } = useLocation();
  const routeDestination = (state as NavigationState | null)?.destination;
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(() =>
    routeDestination
      ? {
          latitude: routeDestination.latitude,
          longitude: routeDestination.longitude,
        }
      : null,
  );

  const map = useOutletContext<naver.maps.Map | null>();

  const navigate = useNavigate();

  // 목적지 확인, 입출차 시간 입력 step
  const [step, setStep] = useState<ParkingSetupStep>('destination');

  // 입출차 날짜 및 시간
  const [period, setPeriod] = useState<ParkingPeriod>(createRoundedCurrentDate());

  // 지도 이동 여부
  const [hasMovedMap, setHasMovedMap] = useState(false);

  const { data, isFetching, isError } = useQuery(
    destinationNameQueryOptions({
      latitude: selectedLocation?.latitude ?? 0,
      longitude: selectedLocation?.longitude ?? 0,
      enabled: Boolean(selectedLocation && hasMovedMap && step === 'destination'),
    }),
  );

  // 입출차 직접 변경 핸들러
  const handleEntryAtChange = (entryAt: Date) => {
    setPeriod((previousPeriod) => ({
      ...previousPeriod,
      entryAt,
    }));
  };

  const handleExitAtChange = (exitAt: Date) => {
    setPeriod((previousPeriod) => ({
      ...previousPeriod,
      exitAt,
    }));
  };

  // 첫 진입시 검색에서 선택한 목적지로 이동
  useEffect(() => {
    if (!map || !routeDestination) return;

    map.panTo(new naver.maps.LatLng(routeDestination.latitude, routeDestination.longitude));
  }, [map, routeDestination]);

  // 지도 이동이 끝났을 때 중앙 좌표 저장
  useEffect(() => {
    if (!map || step !== 'destination') return;

    const listener = naver.maps.Event.addListener(map, 'dragend', () => {
      const center = map.getCenter() as naver.maps.LatLng;

      setSelectedLocation({
        latitude: center.lat(),
        longitude: center.lng(),
      });
      setHasMovedMap(true);
    });
    return () => {
      naver.maps.Event.removeListener(listener);
    };
  }, [map, step]);

  if (!routeDestination || !selectedLocation) return <Navigate to="/search" replace />;

  let destinationName = routeDestination.name;
  if (hasMovedMap) {
    if (isFetching) {
      destinationName = '위치 확인중 ...';
    } else if (isError) {
      destinationName = '위치 이름을 불러오지 못했습니다.';
    } else if (data) {
      destinationName = data.displayName;
    }
  }

  // 추천 받기 핸들러
  const handleRecommend = () => {
    if (!validatePeriod(period)) return;

    const { entryAt, exitAt } = period;

    const searchCondition = {
      destinationName,
      destinationLatitude: selectedLocation.latitude,
      destinationLongitude: selectedLocation.longitude,
      entryAt: formatOffsetDateTime(entryAt),
      exitAt: formatOffsetDateTime(exitAt),
    };

    navigate('/parkingRecommend', {
      state: {
        searchCondition,
      },
    });
  };

  return (
    <main>
      {step === 'destination' && (
        <img className={fixedPinStyle} src={destinationMarkerUrl} alt="" draggable={false} />
      )}
      {step === 'destination' ? (
        <>
          <div
            className={css`
              position: relative;
              z-index: 1;
              width: 100%;
            `}
          >
            <SearchBar value={destinationName} readOnly onClick={() => navigate('/search')} />
          </div>
          <DestinationConfirmSheet
            name={destinationName}
            address={
              hasMovedMap ? undefined : (routeDestination.roadAddress ?? routeDestination.address)
            }
            nextDisabled={hasMovedMap && (isFetching || isError)}
            onCancel={() => navigate('/search')}
            onNext={() => setStep('time')}
          />
        </>
      ) : (
        <>
          <SearchConditionBar destinationName={destinationName} />

          <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
            <ParkingTimeSheet
              period={period}
              onEntryAtChange={handleEntryAtChange}
              onExitAtChange={handleExitAtChange}
              onSubmit={handleRecommend}
            />
          </BottomSheet>
        </>
      )}
    </main>
  );
};

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
