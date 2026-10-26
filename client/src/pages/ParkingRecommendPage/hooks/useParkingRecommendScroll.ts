import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigationType } from 'react-router';

import type { ParkingLotSummary } from '../../../../api/contracts';

interface Props {
  selectedParkingLotId: number | null;
  cardListRef: RefObject<HTMLUListElement | null>;
  parkingListRef: RefObject<HTMLUListElement | null>;
  recommendedParkingLots: ParkingLotSummary[];
  parkingLots: ParkingLotSummary[];
}

const getHorizontalCenterOffset = (container: HTMLElement, item: Element) => {
  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();

  return itemRect.left + itemRect.width / 2 - (containerRect.left + containerRect.width / 2);
};

export const useParkingRecommendScroll = ({
  selectedParkingLotId,
  cardListRef,
  parkingListRef,
  recommendedParkingLots,
  parkingLots,
}: Props) => {
  const { key } = useLocation();
  const navigationType = useNavigationType();
  const lastHandledKeyRef = useRef<string | null>(null);

  const scrollCardToCenter = useCallback(
    (parkingLotId: number) => {
      const index = recommendedParkingLots.findIndex(({ id }) => id === parkingLotId);
      const list = cardListRef.current;
      const card = index >= 0 ? list?.children.item(index) : null;

      if (!list || !card) return;

      const offset = getHorizontalCenterOffset(list, card);

      if (Math.abs(offset) > 1) {
        list.scrollBy({ left: offset, behavior: 'smooth' });
      }
    },
    [cardListRef, recommendedParkingLots],
  );

  const scrollRowIntoView = useCallback(
    (parkingLotId: number) => {
      const index = parkingLots.findIndex(({ id }) => id === parkingLotId);
      const list = parkingListRef.current;
      const row = index >= 0 ? list?.children.item(index) : null;

      if (!list || !row) return;

      const listRect = list.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const offset =
        rowRect.top < listRect.top
          ? rowRect.top - listRect.top
          : rowRect.bottom > listRect.bottom
            ? rowRect.bottom - listRect.bottom
            : 0;

      if (offset !== 0) {
        list.scrollBy({ top: offset, behavior: 'smooth' });
      }
    },
    [parkingListRef, parkingLots],
  );

  const getCenteredParkingLotId = useCallback((): number | null => {
    const list = cardListRef.current;
    if (!list) return null;

    const cards = Array.from(list.children);
    if (cards.length === 0) return null;

    const index = cards.reduce((closestIndex, card, currentIndex) => {
      const closestDistance = Math.abs(getHorizontalCenterOffset(list, cards[closestIndex]!));
      const currentDistance = Math.abs(getHorizontalCenterOffset(list, card));

      return currentDistance < closestDistance ? currentIndex : closestIndex;
    }, 0);

    return recommendedParkingLots[index]?.id ?? null;
  }, [cardListRef, recommendedParkingLots]);

  useLayoutEffect(() => {
    const isInitialMount = lastHandledKeyRef.current === null;
    const isHistoryReturn = lastHandledKeyRef.current !== key && navigationType === 'POP';

    lastHandledKeyRef.current = key;

    if (!isInitialMount && !isHistoryReturn) return;
    if (selectedParkingLotId === null) return;

    scrollCardToCenter(selectedParkingLotId);
    scrollRowIntoView(selectedParkingLotId);
  }, [key, navigationType, selectedParkingLotId, scrollCardToCenter, scrollRowIntoView]);

  return {
    scrollCardToCenter,
    scrollRowIntoView,
    getCenteredParkingLotId,
  };
};
