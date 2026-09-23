import { useState } from 'react';

import { css } from '@emotion/css';

import type { Destination } from '../../../../api/contracts';
import destinationMarkerUrl from '../../../../assets/icons/markers/destinationMarker.svg';
import BottomSheet, { type BottomSheetSnap } from '../../../../shared/components/BottomSheet';
import { SearchBar } from '../../../../shared/components/SearchBar';
import { SearchConditionBar } from '../../../../shared/components/SearchConditionBar';
import type { ParkingSearchCondition } from '../../../../shared/types/navigation';
import { createRoundedCurrentDate, formatOffsetDateTime } from '../../../../shared/utils/time';
import type { ParkingPeriod } from '../model/time';
import { validatePeriod } from '../utils/validate';
import { DestinationConfirmSheet } from './DestinationConfirmSheet';
import { ParkingTimeSheet } from './ParkingTimeSheet';
import { useParkingSetupDestination } from '../hooks/useParkingSetupDestination';

type ParkingSetupStep = 'destination' | 'time';

interface Props {
  map: naver.maps.Map | null;
  destination: Destination;
  onSearch: () => void;
  onRecommend: (searchCondition: ParkingSearchCondition) => void;
}

export const ParkingSetupContent = ({ map, destination, onSearch, onRecommend }: Props) => {
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('expanded');

  const [step, setStep] = useState<ParkingSetupStep>('destination');
  const enabled = step === 'destination' ? true : false;
  const { selectedLocation, destinationName, hasMovedMap, isFetching, isError } =
    useParkingSetupDestination({ destination, map, enabled });

  const [period, setPeriod] = useState<ParkingPeriod>(() => ({
    entryAt: createRoundedCurrentDate(),
    exitAt: null,
  }));

  const [validationTime, setValidationTime] = useState(() => new Date());

  const periodValidation = validatePeriod(period, validationTime);

  const handleEntryAtChange = (entryAt: Date) => {
    setPeriod((previousPeriod) => ({
      ...previousPeriod,
      entryAt,
    }));

    setValidationTime(new Date());
  };

  const handleExitAtChange = (exitAt: Date) => {
    setPeriod((previousPeriod) => ({
      ...previousPeriod,
      exitAt,
    }));

    setValidationTime(new Date());
  };

  const handleTimeStepOpen = () => {
    setValidationTime(new Date());
    setStep('time');
  };

  const handleRecommend = () => {
    const now = new Date();
    const nextValidation = validatePeriod(period, now);

    // 실패하더라도 재렌더링되어 에러 문구가 표시됨
    setValidationTime(now);

    if (!nextValidation.isValid) return;

    const { entryAt, exitAt } = nextValidation.period;

    onRecommend({
      destinationName,
      destinationLatitude: selectedLocation.latitude,
      destinationLongitude: selectedLocation.longitude,
      entryAt: formatOffsetDateTime(entryAt),
      exitAt: formatOffsetDateTime(exitAt),
    });
  };

  return (
    <main>
      {step === 'destination' && (
        <img className={fixedPinStyle} src={destinationMarkerUrl} alt="" draggable={false} />
      )}

      {step === 'destination' ? (
        <>
          <div className={searchBarWrapperStyle}>
            <SearchBar onClick={onSearch} />
          </div>

          <DestinationConfirmSheet
            name={destinationName}
            address={hasMovedMap ? undefined : (destination.roadAddress ?? destination.address)}
            nextDisabled={hasMovedMap && (isFetching || isError)}
            onCancel={onSearch}
            onNext={handleTimeStepOpen}
          />
        </>
      ) : (
        <>
          <SearchConditionBar destinationName={destinationName} />

          <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
            <ParkingTimeSheet
              period={period}
              validation={periodValidation}
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
