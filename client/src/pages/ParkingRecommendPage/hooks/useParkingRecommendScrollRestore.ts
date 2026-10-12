import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigationType } from 'react-router';

import type { ParkingLotSummary } from '../../../../api/contracts';
import type { RecommendView } from '../../../../shared/types/navigation';

interface Props {
  savedView: RecommendView | undefined;
  cardListRef: RefObject<HTMLUListElement | null>;
  parkingListRef: RefObject<HTMLUListElement | null>;
  recommendedParkingLots: ParkingLotSummary[];
  parkingLots: ParkingLotSummary[];
}

export const useParkingRecommendScrollRestore = ({
  savedView,
  cardListRef,
  parkingListRef,
  recommendedParkingLots,
  parkingLots,
}: Props) => {
  const { key } = useLocation();
  const navigationType = useNavigationType();
  const lastHandledKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    // 최초 진입과 다른 기록으로 이동할 때만 복원한다. UI 저장(REPLACE)은 제외한다.
    const shouldRestore =
      lastHandledKeyRef.current === null ||
      (lastHandledKeyRef.current !== key && navigationType !== 'REPLACE');
    lastHandledKeyRef.current = key;

    if (!shouldRestore || !savedView) return;

    const cardList = cardListRef.current;
    const cardIndex = recommendedParkingLots.findIndex(({ id }) => id === savedView.parkingLotId);
    const card = cardIndex >= 0 ? cardList?.children.item(cardIndex) : null;

    if (cardList && card) {
      const listRect = cardList.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();

      cardList.scrollBy({
        left: cardRect.left + cardRect.width / 2 - (listRect.left + listRect.width / 2),
        behavior: 'auto',
      });
    }

    if (savedView.snap === 'expanded') {
      const list = parkingListRef.current;
      const rowIndex = parkingLots.findIndex(({ id }) => id === savedView.parkingLotId);
      const row = rowIndex >= 0 ? list?.children.item(rowIndex) : null;

      if (list && row) {
        const listRect = list.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const offset =
          rowRect.top < listRect.top
            ? rowRect.top - listRect.top
            : rowRect.bottom > listRect.bottom
              ? rowRect.bottom - listRect.bottom
              : 0;

        if (offset !== 0) list.scrollBy({ top: offset, behavior: 'auto' });
      }
    }
  }, [
    key,
    navigationType,
    savedView,
    recommendedParkingLots,
    parkingLots,
    cardListRef,
    parkingListRef,
  ]);
};
