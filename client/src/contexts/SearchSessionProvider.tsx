/** 목적지·방문시간·추천 결과를 담는 검색 세션. 화면 사이를 이동해도 유지된다. */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import { EMPTY_SESSION, todayInSeoul, type DestinationCandidate, type SearchSession } from '../domain';
import { navigate } from '../router';

interface SearchSessionValue {
  session: SearchSession;
  setSession: Dispatch<SetStateAction<SearchSession>>;
  /** 세션을 비운다. 홈으로 돌아갈 때 사용한다. */
  resetSession: () => void;
  /** 검색 결과에서 목적지를 고르고 확정 화면으로 이동한다. */
  selectDestination: (candidate: DestinationCandidate) => void;
  /** 검색 흐름의 방문 시간 입력을 시작한다. */
  startSearchVisit: () => void;
}

const SearchSessionContext = createContext<SearchSessionValue | null>(null);

export const useSearchSession = () => {
  const value = useContext(SearchSessionContext);
  if (!value) throw new Error('SearchSessionProvider 안에서만 사용할 수 있습니다.');
  return value;
};

export const SearchSessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<SearchSession>(EMPTY_SESSION);

  const value = useMemo<SearchSessionValue>(
    () => ({
      session,
      setSession,
      resetSession: () => setSession(EMPTY_SESSION),
      selectDestination: (candidate) => {
        setSession({
          ...EMPTY_SESSION,
          destination: {
            kind: 'SEARCH',
            destinationId: candidate.destinationId,
            name: candidate.name,
            address: candidate.roadAddress ?? candidate.address,
            roadAddress: candidate.roadAddress,
            location: { latitude: candidate.latitude, longitude: candidate.longitude },
          },
        });
        navigate('/destination');
      },
      startSearchVisit: () => {
        setSession((current) => ({
          ...current,
          visitDraft: {
            source: 'SEARCH',
            visitDate: todayInSeoul(),
            entryTime: null,
            exitTime: null,
            nearbyExitWasEdited: false,
          },
          confirmedVisit: null,
          response: null,
          selectedParkingLotId: null,
        }));
        navigate('/visit');
      },
    }),
    [session],
  );

  return <SearchSessionContext.Provider value={value}>{children}</SearchSessionContext.Provider>;
};
