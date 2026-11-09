import { useCallback, useState } from 'react';
import type { BottomSheetSnap } from '../components/ui/BottomSheet';

interface Options {
  /** 처음부터 열어 둘지 여부. 기본값은 false다. */
  initialIsOpen?: boolean;
  /** open()을 인자 없이 호출할 때 사용할 단계. 기본값은 medium이다. */
  initialSnap?: BottomSheetSnap;
}

/**
 * 사용처에서 시트의 열림 여부와 단계를 관리한다. DOM 측정과 드래그는 BottomSheet가 담당한다.
 * open()은 기본 단계로, open('full')은 지정한 단계로 연다.
 * close()는 닫는 전환을 위해 현재 단계를 유지한다. setSnap()은 열림 여부를 바꾸지 않는다.
 */
export const useBottomSheet = ({ initialIsOpen = false, initialSnap = 'medium' }: Options = {}) => {
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const [snap, setSnap] = useState<BottomSheetSnap>(initialSnap);

  const open = useCallback(
    (nextSnap: BottomSheetSnap = initialSnap) => {
      setSnap(nextSnap);
      setIsOpen(true);
    },
    [initialSnap],
  );

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return { isOpen, snap, open, close, setSnap };
};
