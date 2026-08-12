/** 하단 내비게이션처럼 화면 어디서나 같은 뜻을 갖는 이동 동작. */

import { useLocation, useRecentUses, useSearchSession } from '../contexts';
import { navigate, useRoute } from '../router';

export const useGlobalNav = () => {
  const route = useRoute();
  const { resetSession } = useSearchSession();
  const { refreshRecent } = useRecentUses();
  const { locate } = useLocation();

  return {
    goHome: () => {
      resetSession();
      if (route.route !== '/') navigate('/');
    },
    goRecent: () => {
      refreshRecent();
      if (route.route !== '/recent') navigate('/recent');
    },
    goNearby: () => void locate(true),
  };
};
