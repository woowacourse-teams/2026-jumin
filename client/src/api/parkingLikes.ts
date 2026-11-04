import type { ParkingLikeResponse } from './contracts';
import { parkingLikeSchema } from './parkingLotsSchema';
import { parseApiResponse } from './parseApiResponse';
import { getGuestId } from '../shared/utils/guestId';
import { request } from './request';
import { ApiError } from './apiError';

export const updateParkingLike = async (
  parkingLotId: number,
  likedByMe: boolean,
): Promise<ParkingLikeResponse> => {
  const response = await request(`/api/parking/${parkingLotId}/like`, {
    method: likedByMe ? 'PUT' : 'DELETE',
    headers: { 'X-Guest-Id': getGuestId() },
  });

  const result = await parseApiResponse(response, parkingLikeSchema);

  if (result.parkingLotId !== parkingLotId || result.likedByMe !== likedByMe) {
    throw new ApiError({
      errorType: 'response',
      reason: 'mismatch',
    });
  }

  return result;
};
