/** 전역 상태 Provider 조립. 의존 순서: 세션 → 최근 이용 → 위치 → 오버레이. */

import type { ReactNode } from 'react';

import { LocationProvider } from './LocationProvider';
import { OverlayProvider } from './OverlayProvider';
import { RecentUsesProvider } from './RecentUsesProvider';
import { SearchSessionProvider } from './SearchSessionProvider';

export const AppProviders = ({ children }: { children: ReactNode }) => (
  <SearchSessionProvider>
    <RecentUsesProvider>
      <LocationProvider>
        <OverlayProvider>{children}</OverlayProvider>
      </LocationProvider>
    </RecentUsesProvider>
  </SearchSessionProvider>
);
