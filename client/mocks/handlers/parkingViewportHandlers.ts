import { delay, http, HttpResponse } from 'msw';

import type {
  FieldError,
  ParkingLotViewportResponse,
  ValidationErrorResponse,
} from '../../api/contracts';
import { parkingViewportLots } from '../fixtures/parkingViewport';

type ViewportField = 'southLatitude' | 'westLongitude' | 'northLatitude' | 'eastLongitude';

interface ViewportBounds {
  southLatitude: number;
  westLongitude: number;
  northLatitude: number;
  eastLongitude: number;
}

const viewportFieldConfig: Record<
  ViewportField,
  { label: string; min: number; max: number; exclusive: boolean }
> = {
  southLatitude: { label: '남쪽 위도', min: -90, max: 90, exclusive: true },
  westLongitude: { label: '서쪽 경도', min: -180, max: 180, exclusive: false },
  northLatitude: { label: '북쪽 위도', min: -90, max: 90, exclusive: true },
  eastLongitude: { label: '동쪽 경도', min: -180, max: 180, exclusive: false },
};

const validateCoordinate = (field: ViewportField, value: string | null): FieldError[] => {
  const { label, min, max, exclusive } = viewportFieldConfig[field];

  if (value === null || value.trim() === '') {
    return [{ field, message: `${label}는 필수입니다.` }];
  }

  const coordinate = Number(value);
  const isOutOfRange = exclusive
    ? coordinate <= min || coordinate >= max
    : coordinate < min || coordinate > max;

  if (!Number.isFinite(coordinate) || isOutOfRange) {
    return [{ field, message: `${label} 범위가 올바르지 않습니다.` }];
  }

  return [];
};

const parseViewportBounds = (url: URL): ViewportBounds | FieldError[] => {
  const values = {
    southLatitude: url.searchParams.get('southLatitude'),
    westLongitude: url.searchParams.get('westLongitude'),
    northLatitude: url.searchParams.get('northLatitude'),
    eastLongitude: url.searchParams.get('eastLongitude'),
  };
  const errors = (Object.entries(values) as [ViewportField, string | null][]).flatMap(
    ([field, value]) => validateCoordinate(field, value),
  );

  if (errors.length > 0) return errors;

  return {
    southLatitude: Number(values.southLatitude),
    westLongitude: Number(values.westLongitude),
    northLatitude: Number(values.northLatitude),
    eastLongitude: Number(values.eastLongitude),
  };
};

const isFieldErrorArray = (value: ViewportBounds | FieldError[]): value is FieldError[] =>
  Array.isArray(value);

export const parkingViewportHandlers = [
  http.get('/api/parking/viewport', async ({ request }) => {
    const bounds = parseViewportBounds(new URL(request.url));

    if (isFieldErrorArray(bounds)) {
      return HttpResponse.json(
        {
          message: '요청 값이 올바르지 않습니다.',
          errors: bounds,
        } satisfies ValidationErrorResponse,
        { status: 400 },
      );
    }

    if (
      bounds.southLatitude >= bounds.northLatitude ||
      bounds.westLongitude >= bounds.eastLongitude
    ) {
      return HttpResponse.json(
        {
          message: '요청 값이 올바르지 않습니다.',
          errors: [],
        } satisfies ValidationErrorResponse,
        { status: 400 },
      );
    }

    const parkingLots = parkingViewportLots.filter(
      ({ latitude, longitude }) =>
        latitude >= bounds.southLatitude &&
        latitude <= bounds.northLatitude &&
        longitude >= bounds.westLongitude &&
        longitude <= bounds.eastLongitude,
    );

    await delay(200);

    return HttpResponse.json({
      totalCount: parkingLots.length,
      parkingLots,
    } satisfies ParkingLotViewportResponse);
  }),
];
