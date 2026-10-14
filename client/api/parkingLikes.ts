import type { ParkingLikeResponse } from './contracts';
import { parkingLikeSchema } from './parkingLotsSchema';
import { parseApiResponse } from './parseApiResponse';
import { getGuestId } from '../shared/utils/guestId';

export const updateParkingLike = async (
  parkingLotId: number,
  likedByMe: boolean,
): Promise<ParkingLikeResponse> => {
  const response = await fetch(`/api/parking/${parkingLotId}/like`, {
    method: likedByMe ? 'PUT' : 'DELETE',
    headers: { 'X-Guest-Id': getGuestId() },
  });

  const result = await parseApiResponse(
    response,
    parkingLikeSchema,
    '좋아요를 변경하지 못했어요. 다시 시도해주세요.',
  );

  if (result.parkingLotId !== parkingLotId || result.likedByMe !== likedByMe) {
    throw new Error('좋아요를 변경하지 못했어요. 다시 시도해주세요.');
  }

  return result;
};
