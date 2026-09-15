import { delay, http, HttpResponse } from 'msw';

import type { ValidationErrorResponse } from '../../api/contracts';
import { viewportParkingLotDetailFixtures } from '../fixtures/viewportParkingLotDetails';

const createErrorResponse = (message: string, status: 404 | 500) =>
  HttpResponse.json<ValidationErrorResponse>({ message, errors: [] }, { status });

export const parkingViewportDetailHandlers = [
  http.get('/api/parking/viewport/:parkingLotId', async ({ params }) => {
    const parkingLotId = Number(params.parkingLotId);
    const parkingLotDetail = Number.isSafeInteger(parkingLotId)
      ? viewportParkingLotDetailFixtures[parkingLotId]
      : undefined;

    if (!parkingLotDetail) {
      return createErrorResponse('주차장 정보를 찾을 수 없습니다.', 404);
    }

    await delay(400);

    return HttpResponse.json(parkingLotDetail);
  }),
];
