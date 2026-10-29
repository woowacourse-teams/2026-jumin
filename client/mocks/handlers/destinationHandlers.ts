import { delay, http, HttpResponse } from 'msw';
import type { DestinationNameResponse, DestinationSearchResponse } from '../../api/contracts';
import { destinationFixtures } from '../fixtures/destinations';
import { getMockScenario } from '../scenario';
import type { FieldError, ValidationErrorResponse } from '../types/validationError';

const validateCoordinates = (params: URLSearchParams): FieldError[] => {
  const latitudeValue = params.get('latitude')?.trim() || null;
  const longitudeValue = params.get('longitude')?.trim() || null;

  if (latitudeValue === null && longitudeValue === null) return [];

  if (latitudeValue === null || longitudeValue === null) {
    return [{ field: 'coordinatePairValid', message: '위도와 경도는 함께 전달해야 합니다.' }];
  }

  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  const errors: FieldError[] = [];

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.push({ field: 'latitude', message: '위도 범위가 올바르지 않습니다.' });
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    errors.push({ field: 'longitude', message: '경도 범위가 올바르지 않습니다.' });
  }

  return errors;
};

export const destinationHandlers = [
  http.get('/api/destinations/search', async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const query = params.get('query')?.trim() ?? '';
    const scenario = getMockScenario();

    const coordinateErrors = validateCoordinates(params);
    if (coordinateErrors.length > 0) {
      return HttpResponse.json<ValidationErrorResponse>(
        { message: '요청 값이 올바르지 않습니다.', errors: coordinateErrors },
        { status: 400 },
      );
    }

    if (query.length < 2) {
      return HttpResponse.json<ValidationErrorResponse>(
        {
          message: '검색어는 2자 이상 입력해 주세요.',
          errors: [],
        },
        { status: 400 },
      );
    }

    await delay(300);

    if (scenario === 'destination-rate-limited') {
      return HttpResponse.json<ValidationErrorResponse>(
        {
          message: '목적지 검색 요청이 너무 많습니다.',
          errors: [],
        },
        { status: 429 },
      );
    }

    if (scenario === 'destination-failed') {
      return HttpResponse.json<ValidationErrorResponse>(
        {
          message: '일시적으로 목적지 검색을 이용할 수 없습니다.',
          errors: [],
        },
        { status: 502 },
      );
    }

    const normalizedQuery = query.toLowerCase();
    const matchedDestinations = destinationFixtures.filter((destination) =>
      [destination.name, destination.address, destination.roadAddress].some((value) =>
        value?.toLowerCase().includes(normalizedQuery),
      ),
    );

    const response: DestinationSearchResponse = {
      query,
      destinations:
        scenario === 'destination-empty'
          ? []
          : matchedDestinations.map((destination) => ({ ...destination, provider: 'KAKAO' })),
    };

    return HttpResponse.json(response);
  }),
  http.get('/api/destinations/reverse-geocode', async () => {
    await delay(500);

    return HttpResponse.json<DestinationNameResponse>({
      displayName: '지도에서 다시 선택한 목적지',
    });
  }),
];
