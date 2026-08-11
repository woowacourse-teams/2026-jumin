/** 최근 이용한 주차장 목록. 로컬 저장소를 읽어 화면에 제공한다. */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { loadRecentUses, type RecentUse } from '../domain';

interface RecentUsesValue {
  recent: RecentUse[];
  /** 저장소에서 다시 읽어 목록을 갱신한다. */
  refreshRecent: () => void;
}

const RecentUsesContext = createContext<RecentUsesValue | null>(null);

export const useRecentUses = () => {
  const value = useContext(RecentUsesContext);
  if (!value) throw new Error('RecentUsesProvider 안에서만 사용할 수 있습니다.');
  return value;
};

export const RecentUsesProvider = ({ children }: { children: ReactNode }) => {
  const [recent, setRecent] = useState<RecentUse[]>(loadRecentUses);
  const value = useMemo<RecentUsesValue>(
    () => ({ recent, refreshRecent: () => setRecent(loadRecentUses()) }),
    [recent],
  );
  return <RecentUsesContext.Provider value={value}>{children}</RecentUsesContext.Provider>;
};
