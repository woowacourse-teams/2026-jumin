import { delay, http, HttpResponse } from 'msw';
import { parkingDetailFixtures } from '../fixtures/parkingDetails';
import { viewportParkingLotDetailFixtures } from '../fixtures/viewportParkingLotDetails';
import { UUID_V4_PATTERN } from '../../shared/utils/anonymousId';

const likedUsers = new Map<number, Set<string>>();

export const resetParkingLikes = () => likedUsers.clear();

export const getMockParkingLike = (parkingLotId: number, anonymousId: string | null) => {
  const parkingLot = viewportParkingLotDetailFixtures[parkingLotId];
  const users = likedUsers.get(parkingLotId);

  return {
    parkingLotId,
    likeCount: (parkingLot?.likeCount ?? 0) + (users?.size ?? 0),
    likedByMe: anonymousId !== null && (users?.has(anonymousId) ?? false),
  };
};

const updateLike = async (request: Request, parkingLotId: number) => {
  const anonymousId = request.headers.get('X-Guest-Id');
  if (
    !Number.isSafeInteger(parkingLotId) ||
    parkingLotId <= 0 ||
    !anonymousId ||
    !UUID_V4_PATTERN.test(anonymousId)
  ) {
    return HttpResponse.json({ message: '요청 값이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!parkingDetailFixtures[parkingLotId] && !viewportParkingLotDetailFixtures[parkingLotId]) {
    return HttpResponse.json({ message: '주차장 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  await delay(150);

  const users = likedUsers.get(parkingLotId) ?? new Set<string>();
  if (request.method === 'PUT') {
    users.add(anonymousId);
  } else {
    users.delete(anonymousId);
  }
  likedUsers.set(parkingLotId, users);

  return HttpResponse.json(getMockParkingLike(parkingLotId, anonymousId));
};

export const parkingLikeHandlers = [
  http.put('/api/parking/:parkingLotId/like', ({ request, params }) =>
    updateLike(request, Number(params.parkingLotId)),
  ),
  http.delete('/api/parking/:parkingLotId/like', ({ request, params }) =>
    updateLike(request, Number(params.parkingLotId)),
  ),
];
