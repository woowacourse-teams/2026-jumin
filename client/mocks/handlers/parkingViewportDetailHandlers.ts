import { delay, http, HttpResponse } from 'msw';

import { viewportParkingLotDetailFixtures } from '../fixtures/viewportParkingLotDetails';
import type { ValidationErrorResponse } from '../types/validationError';
import { getMockParkingLike } from './parkingLikeHandlers';

const createErrorResponse = (message: string, status: 404 | 500) =>
  HttpResponse.json<ValidationErrorResponse>({ message, errors: [] }, { status });

export const parkingViewportDetailHandlers = [
  http.get('/api/parking/viewport/:parkingLotId', async ({ params, request }) => {
    const parkingLotId = Number(params.parkingLotId);
    const parkingLotDetail = Number.isSafeInteger(parkingLotId)
      ? viewportParkingLotDetailFixtures[parkingLotId]
      : undefined;

    if (!parkingLotDetail) {
      return createErrorResponse('주차장 정보를 찾을 수 없습니다.', 404);
    }

    await delay(400);

    const { likeCount, likedByMe } = getMockParkingLike(
      parkingLotId,
      request.headers.get('X-Guest-Id'),
    );
    return HttpResponse.json({ ...parkingLotDetail, likeCount, likedByMe });
  }),
];
