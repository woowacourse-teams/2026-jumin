/** 화면 위에 뜨는 오버레이(시간 선택, 길찾기 앱 선택)의 상태와 동작. */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import {
  addVisitMinutes,
  nextTenMinuteSlot,
  saveRecentUse,
  type DirectionsProvider,
  type ParkingTarget,
} from '../domain';
import { openDirections } from '../platform';
import { closeOverlay, openOverlay } from '../router';
import { useRecentUses } from './RecentUsesProvider';
import { useSearchSession } from './SearchSessionProvider';

export interface PickerState {
  kind: 'ENTRY' | 'EXIT';
  hour: string;
  minute: string;
}

interface OverlayValue {
  picker: PickerState | null;
  setPicker: Dispatch<SetStateAction<PickerState | null>>;
  openDatePicker: () => void;
  closeDatePicker: () => void;
  openTimePicker: (kind: PickerState['kind'], initial: string | null) => void;
  confirmPicker: () => void;
  directionsTarget: ParkingTarget | null;
  directionsError: string;
  showDirections: (target: ParkingTarget) => void;
  dispatchDirections: (provider: DirectionsProvider) => Promise<void>;
}

const OverlayContext = createContext<OverlayValue | null>(null);

export const useOverlay = () => {
  const value = useContext(OverlayContext);
  if (!value) throw new Error('OverlayProvider 안에서만 사용할 수 있습니다.');
  return value;
};

export const OverlayProvider = ({ children }: { children: ReactNode }) => {
  const { session, setSession } = useSearchSession();
  const { refreshRecent } = useRecentUses();
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [directionsTarget, setDirectionsTarget] = useState<ParkingTarget | null>(null);
  const [directionsError, setDirectionsError] = useState('');

  const value = useMemo<OverlayValue>(
    () => ({
      picker,
      setPicker,
      directionsTarget,
      directionsError,
      openDatePicker: () => openOverlay('VISIT_DATE'),
      closeDatePicker: () => closeOverlay(),
      openTimePicker: (kind, initial) => {
        const draft = session.visitDraft;
        const fallback =
          initial ??
          (kind === 'EXIT' && draft?.entryTime ? addVisitMinutes({ ...draft, exitTime: null }, 60)?.exitTime : null) ??
          nextTenMinuteSlot().time;
        const [hour = '00', minute = '00'] = fallback.split(':');
        setPicker({ kind, hour, minute: String(Math.floor(Number(minute) / 10) * 10).padStart(2, '0') });
        openOverlay('VISIT_TIME_PICKER');
      },
      confirmPicker: () => {
        if (!picker) return;
        setSession((current) => {
          if (!current.visitDraft) return current;
          const time = `${picker.hour}:${picker.minute}`;
          return {
            ...current,
            visitDraft: {
              ...current.visitDraft,
              ...(picker.kind === 'ENTRY' ? { entryTime: time } : { exitTime: time }),
              nearbyExitWasEdited:
                current.visitDraft.nearbyExitWasEdited ||
                (current.visitDraft.source === 'NEARBY' && picker.kind === 'EXIT'),
            },
          };
        });
        closeOverlay();
      },
      showDirections: (target) => {
        setDirectionsTarget(target);
        setDirectionsError('');
        openOverlay('DIRECTIONS');
      },
      dispatchDirections: async (provider) => {
        if (!directionsTarget) return;
        const result = await openDirections(provider, directionsTarget);
        if (result.status === 'DISPATCHED') {
          saveRecentUse(directionsTarget);
          refreshRecent();
          setDirectionsTarget(null);
          closeOverlay();
        } else if (result.status === 'FALLBACK_OPENED') {
          setDirectionsTarget(null);
          closeOverlay();
        } else setDirectionsError('지도 앱을 열지 못했어요. 다른 앱을 선택해주세요.');
      },
    }),
    [picker, directionsTarget, directionsError, session.visitDraft, setSession, refreshRecent],
  );

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
};
