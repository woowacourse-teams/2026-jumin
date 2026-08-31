import { delay, http, HttpResponse } from 'msw';

import type { FieldError } from '../../api/contracts';
import { parkingDetailFixtures } from '../fixtures/parkingDetails';
import { getMockScenario } from '../scenario';

const offsetDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:(\d{2}):00\+09:00$/;

const validateCoordinates = (
  latitudeValue: string | null,
  longitudeValue: string | null,
): FieldError[] => {
  const errors: FieldError[] = [];
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  if (!latitudeValue) {
    errors.push({ field: 'destinationLatitude', message: '목적지 위도는 필수입니다.' });
  } else if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.push({ field: 'destinationLatitude', message: '목적지 위도 범위가 올바르지 않습니다.' });
  }

  if (!longitudeValue) {
    errors.push({ field: 'destinationLongitude', message: '목적지 경도는 필수입니다.' });
  } else if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    errors.push({
      field: 'destinationLongitude',
      message: '목적지 경도 범위가 올바르지 않습니다.',
    });
  }

  return errors;
};

const validateDateTime = (field: 'entryAt' | 'exitAt', value: string | null): FieldError[] => {
  if (!value) {
    return [
      {
        field,
        message: field === 'entryAt' ? '입차 시각은 필수입니다.' : '출차 시각은 필수입니다.',
      },
    ];
  }

  const match = offsetDateTimePattern.exec(value);

  if (!match || Number(match[1]) % 10 !== 0 || Number.isNaN(Date.parse(value))) {
    return [{ field, message: '시각은 +09:00 오프셋을 포함한 10분 단위여야 합니다.' }];
  }

  return [];
};

const validateParkingDetailRequest = (url: URL): FieldError[] => {
  const latitude = url.searchParams.get('destinationLatitude');
  const longitude = url.searchParams.get('destinationLongitude');
  const entryAt = url.searchParams.get('entryAt');
  const exitAt = url.searchParams.get('exitAt');
  const errors = [
    ...validateCoordinates(latitude, longitude),
    ...validateDateTime('entryAt', entryAt),
    ...validateDateTime('exitAt', exitAt),
  ];

  if (errors.length > 0 || entryAt === null || exitAt === null) return errors;

  const entryTime = Date.parse(entryAt);
  const exitTime = Date.parse(exitAt);

  if (exitTime <= entryTime) {
    errors.push({ field: 'exitAt', message: '출차 시각은 입차 시각보다 이후여야 합니다.' });
  } else if (exitTime - entryTime > 24 * 60 * 60 * 1000) {
    errors.push({ field: 'exitAt', message: '체류시간은 1,440분 이하여야 합니다.' });
  }

  return errors;
};

const createErrorResponse = (message: string, status: 404 | 500) =>
  HttpResponse.json({ message, errors: [] }, { status });

export const parkingDetailHandlers = [
  http.get('/api/parking/:parkingLotId', async ({ params, request }) => {
    const errors = validateParkingDetailRequest(new URL(request.url));

    if (errors.length > 0) {
      return HttpResponse.json(
        {
          message: '요청 값이 올바르지 않습니다.',
          errors,
        },
        { status: 400 },
      );
    }

    const scenario = getMockScenario();

    if (scenario === 'parking-detail-server-error') {
      return createErrorResponse('요청을 처리하는 중 서버 오류가 발생했습니다.', 500);
    }

    const parkingLotId = Number(params.parkingLotId);
    const parkingLot = Number.isSafeInteger(parkingLotId)
      ? parkingDetailFixtures[parkingLotId]
      : undefined;

    if (scenario === 'parking-detail-not-found' || !parkingLot) {
      return createErrorResponse('주차장 정보를 찾을 수 없습니다.', 404);
    }

    await delay(scenario === 'parking-detail-slow' ? 2000 : 400);

    return HttpResponse.json(parkingLot);
  }),
];
