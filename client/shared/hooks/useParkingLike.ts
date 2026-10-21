import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ParkingLikeState } from '../../api/contracts';
import { updateParkingLike } from '../../api/parkingLikes';
import { parkingKeys } from '../../api/queries/parkingKeys';
import { API_ERROR_MESSAGES } from '../../api/apiErrorMessages';

const LIKE_DEBOUNCE_DELAY = 300;

export const useParkingLike = (parkingLotId: number, confirmed: ParkingLikeState) => {
  const queryClient = useQueryClient();
  const [desiredLiked, setDesiredLiked] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestInFlight = useRef(false);

  const detailFilter = { queryKey: parkingKeys.viewportDetail(parkingLotId) };

  const mutation = useMutation({
    mutationFn: (likedByMe: boolean) => updateParkingLike(parkingLotId, likedByMe),
    retry: false,
    meta: { feature: 'parking-like', operation: 'update-parking-like' },
    onSuccess: async ({ likeCount, likedByMe }) => {
      await queryClient.cancelQueries(detailFilter);
      queryClient.setQueriesData<ParkingLikeState>(detailFilter, (detail) =>
        detail ? { ...detail, likeCount, likedByMe } : detail,
      );
    },
    onError: () => {
      // 응답만 유실된 경우에도 서버의 실제 좋아요 상태를 다시 확인한다.
      void queryClient.invalidateQueries(detailFilter);
    },
    onSettled: () => {
      requestInFlight.current = false;
      setDesiredLiked(null);
    },
  });

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const toggle = () => {
    if (requestInFlight.current) return;

    const nextLiked = !(desiredLiked ?? confirmed.likedByMe);
    setDesiredLiked(nextLiked);
    mutation.reset();
    if (timer.current !== null) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      timer.current = null;
      if (nextLiked === confirmed.likedByMe) {
        setDesiredLiked(null);
        return;
      }

      requestInFlight.current = true;
      mutation.mutate(nextLiked);
    }, LIKE_DEBOUNCE_DELAY);
  };

  const likedByMe = desiredLiked ?? confirmed.likedByMe;

  return {
    likedByMe,
    likeCount: confirmed.likeCount + Number(likedByMe) - Number(confirmed.likedByMe),
    toggle,
    isPending: mutation.isPending,
    errorMessage: mutation.isError ? API_ERROR_MESSAGES.parkingLike : null,
  };
};
