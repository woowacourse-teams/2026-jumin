import { useEffect, useState } from 'react';

export type AppOverlay = 'NONE' | 'VISIT_DATE' | 'VISIT_TIME_PICKER' | 'DIRECTIONS' | 'LOCATION';
export type DetailOrigin = 'RESULTS' | 'PARKING_LOTS' | 'RECENT';

export interface AppHistoryState {
  appHistoryIndex: number;
  route: string;
  overlay: AppOverlay;
  detailOrigin?: DetailOrigin;
}

const currentState = (): AppHistoryState => {
  const state = history.state as Partial<AppHistoryState> | null;
  return {
    appHistoryIndex: typeof state?.appHistoryIndex === 'number' ? state.appHistoryIndex : 0,
    route: location.pathname,
    overlay: state?.overlay ?? 'NONE',
    ...(state?.detailOrigin ? { detailOrigin: state.detailOrigin } : {}),
  };
};

const notify = () => window.dispatchEvent(new Event('app:navigate'));

export const initializeHistory = () => {
  if (typeof (history.state as Partial<AppHistoryState> | null)?.appHistoryIndex !== 'number')
    history.replaceState(currentState(), '', location.pathname);
};

export const navigate = (route: string, options?: { replace?: boolean; detailOrigin?: DetailOrigin }) => {
  const current = currentState();
  const state: AppHistoryState = {
    appHistoryIndex: options?.replace ? current.appHistoryIndex : current.appHistoryIndex + 1,
    route,
    overlay: 'NONE',
    ...(options?.detailOrigin ? { detailOrigin: options.detailOrigin } : {}),
  };
  if (options?.replace) history.replaceState(state, '', route);
  else history.pushState(state, '', route);
  notify();
};

export const openOverlay = (overlay: Exclude<AppOverlay, 'NONE'>) => {
  const current = currentState();
  history.pushState({ ...current, appHistoryIndex: current.appHistoryIndex + 1, overlay }, '', location.pathname);
  notify();
};

export const closeOverlay = () => history.back();

export const useRoute = () => {
  const [state, setState] = useState(currentState);
  useEffect(() => {
    const update = () => setState(currentState());
    window.addEventListener('popstate', update);
    window.addEventListener('app:navigate', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('app:navigate', update);
    };
  }, []);
  return state;
};

/** 주차장 상세로 이동한다. 어디서 왔는지 남겨 뒤로가기 동작을 구분한다. */
export const openDetail = (parkingLotId: string, origin: DetailOrigin) =>
  navigate(`/parking-lots/${encodeURIComponent(parkingLotId)}`, { detailOrigin: origin });
