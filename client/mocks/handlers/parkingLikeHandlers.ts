import { delay, http, HttpResponse } from 'msw';
import { parkingDetailFixtures } from '../fixtures/parkingDetails';
import { viewportParkingLotDetailFixtures } from '../fixtures/viewportParkingLotDetails';
import { UUID_V4_PATTERN } from '../../shared/utils/guestId';

const likedUsers = new Map<number, Set<string>>();

export const resetParkingLikes = () => likedUsers.clear();

export const getMockParkingLike = (parkingLotId: number, guestId: string | null) => {
  const parkingLot = viewportParkingLotDetailFixtures[parkingLotId];
  const users = likedUsers.get(parkingLotId);

  return {
    parkingLotId,
    likeCount: (parkingLot?.likeCount ?? 0) + (users?.size ?? 0),
    likedByMe: guestId !== null && (users?.has(guestId) ?? false),
  };
};

const updateLike = async (request: Request, parkingLotId: number) => {
  const guestId = request.headers.get('X-Guest-Id');
  if (
    !Number.isSafeInteger(parkingLotId) ||
    parkingLotId <= 0 ||
    !guestId ||
    !UUID_V4_PATTERN.test(guestId)
  ) {
    return HttpResponse.json({ message: '요청 값이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!parkingDetailFixtures[parkingLotId] && !viewportParkingLotDetailFixtures[parkingLotId]) {
    return HttpResponse.json({ message: '주차장 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  await delay(150);

  const users = likedUsers.get(parkingLotId) ?? new Set<string>();
  if (request.method === 'PUT') {
    users.add(guestId);
  } else {
    users.delete(guestId);
  }
  likedUsers.set(parkingLotId, users);

  return HttpResponse.json(getMockParkingLike(parkingLotId, guestId));
};

export const parkingLikeHandlers = [
  http.put('/api/parking/:parkingLotId/like', ({ request, params }) =>
    updateLike(request, Number(params.parkingLotId)),
  ),
  http.delete('/api/parking/:parkingLotId/like', ({ request, params }) =>
    updateLike(request, Number(params.parkingLotId)),
  ),
];
