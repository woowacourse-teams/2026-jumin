import { useState } from 'react';
import BottomSheet, { BottomSheetSnap } from '../../../shared/components/BottomSheet';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Destination } from '../../../api/contracts';
import { SearchBar } from '../../../shared/components/SearchBar';
import { DestinationConfirmSheet } from './components/DestinationConfirmSheet';
import { SearchConditionBar } from '../../../shared/components/SearchConditionBar';
import { ParkingTimeSheet } from './components/ParkingTimeSheet';
import { createRoundedCurrentTime, TimeValue } from './model/time';
import { createSearchPeriod } from './model/searchCondition';

// 목적지 확인, 입출차 시간 입력 step
type ParkingSetupStep = 'destination' | 'time';

// 검색에서 넘어온 state 인터페이스
interface NavigationState {
  destination?: Destination;
}

export const ParkingSetupPage = () => {
  const navigate = useNavigate();

  // 목적지 확인, 입출차 시간 입력 step
  const [step, setStep] = useState<ParkingSetupStep>('destination');

  // 입/출차 시간
  const [entryTime, setEntryTime] = useState<TimeValue>(createRoundedCurrentTime());
  const [exitTime, setExitTime] = useState<TimeValue | null>(null);

  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('expanded');

  // 검색 페이지에서 받아오는 state에서 destination이 존재하는지 확인
  const { state } = useLocation();
  const destination = (state as NavigationState | null)?.destination;
  if (!destination) return <Navigate to="/search" replace />;

  // 추천 받기 핸들러
  const handleRecommend = () => {
    if (exitTime === null) {
      return;
    }

    const { entryAt, exitAt } = createSearchPeriod(new Date(), entryTime, exitTime);

    const searchCondition = {
      destinationName: destination.name,
      destinationLatitude: destination.latitude,
      destinationLongitude: destination.longitude,
      entryAt,
      exitAt,
    };

    navigate('/parkingRecommend', {
      state: {
        searchCondition,
      },
    });
  };

  return (
    <main>
      {step === 'destination' ? (
        <>
          <SearchBar onClick={() => navigate('/search')} />

          <DestinationConfirmSheet
            destination={destination}
            onCancel={() => navigate('/search')}
            onNext={() => setStep('time')}
          />
        </>
      ) : (
        <>
          <SearchConditionBar destinationName={destination.name} />

          <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
            <ParkingTimeSheet
              entryTime={entryTime}
              exitTime={exitTime}
              onEntryTimeChange={setEntryTime}
              onExitTimeChange={setExitTime}
              onSubmit={handleRecommend}
            />
          </BottomSheet>
        </>
      )}
    </main>
  );
};
