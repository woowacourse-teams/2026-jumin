/** 백엔드 응답의 wire 계약 검증. 계약 위반은 ContractError로 던진다. */

import type {
  Coordinate,
  DestinationSearchResponse,
  ParkingLotDetailResponse,
  ParkingLotSummary,
  ParkingSearchRequest,
  ParkingSearchResponse,
  SortCategory,
  SortRanks,
} from './types';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isInteger = (value: unknown): value is number => Number.isInteger(value);
const isNonNegativeInteger = (value: unknown): value is number => isInteger(value) && value >= 0;
const isNullableNonNegativeInteger = (value: unknown): value is number | null =>
  value === null || isNonNegativeInteger(value);
const isPositiveIntegerOrNull = (value: unknown): value is number | null =>
  value === null || (isInteger(value) && value > 0);
export const isCoordinate = (value: unknown): value is Coordinate =>
  isRecord(value) &&
  typeof value.latitude === 'number' &&
  Number.isFinite(value.latitude) &&
  value.latitude >= -90 &&
  value.latitude <= 90 &&
  typeof value.longitude === 'number' &&
  Number.isFinite(value.longitude) &&
  value.longitude >= -180 &&
  value.longitude <= 180;
export const isIsoSeoul = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:[0-5]\d:00\+09:00$/.test(value) &&
  Number.isFinite(Date.parse(value));

const DEPRECATED_FIELDS = new Set([
  'arrivalAt',
  'departureAt',
  'stayMinutes',
  'balancedRank',
  'recommendationLabel',
  'recommendationReason',
  'availability',
  'spaces',
  'operationStatus',
]);

const hasDeprecatedField = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasDeprecatedField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => DEPRECATED_FIELDS.has(key) || hasDeprecatedField(child));
};

export class ContractError extends Error {}

const requireContract: (condition: boolean) => asserts condition = (condition) => {
  if (!condition) throw new ContractError('API 응답이 계약과 일치하지 않습니다.');
};

export const parseDestinationSearchResponse = (value: unknown): DestinationSearchResponse => {
  requireContract(isRecord(value) && !hasDeprecatedField(value));
  requireContract(
    typeof value.query === 'string' && Array.isArray(value.destinations) && value.destinations.length <= 10,
  );
  requireContract(
    value.destinations.every(
      (item) =>
        isRecord(item) &&
        isNonEmptyString(item.destinationId) &&
        isNonEmptyString(item.name) &&
        isNonEmptyString(item.address) &&
        (item.roadAddress === null || typeof item.roadAddress === 'string') &&
        isCoordinate({ latitude: item.latitude, longitude: item.longitude }) &&
        isNullableNonNegativeInteger(item.distanceFromCurrentLocationMeters) &&
        item.provider === 'NAVER',
    ),
  );
  return value as unknown as DestinationSearchResponse;
};

const categoryOrder: SortCategory[] = ['BALANCED', 'DISTANCE', 'PRICE'];

const ranksAreContinuous = (lots: ParkingLotSummary[], key: keyof SortRanks) => {
  const ranks = lots
    .map((lot) => lot.sortRanks[key])
    .filter((rank): rank is number => rank !== null)
    .sort((a, b) => a - b);
  return ranks.every((rank, index) => rank === index + 1);
};

export const parseParkingSearchResponse = (value: unknown, request: ParkingSearchRequest): ParkingSearchResponse => {
  requireContract(isRecord(value) && !hasDeprecatedField(value));
  requireContract(value.searchRadiusMeters === 600 && isRecord(value.searchCondition));
  const condition = value.searchCondition;
  requireContract(isRecord(condition.destination) && isCoordinate(condition.destination));
  requireContract(condition.destination.name === null || typeof condition.destination.name === 'string');
  requireContract(
    isIsoSeoul(condition.entryAt) && isIsoSeoul(condition.exitAt) && isPositiveIntegerOrNull(condition.durationMinutes),
  );
  requireContract(
    condition.destination.latitude === request.destinationLatitude &&
      condition.destination.longitude === request.destinationLongitude &&
      condition.entryAt === request.entryAt &&
      condition.exitAt === request.exitAt &&
      condition.durationMinutes === (Date.parse(request.exitAt) - Date.parse(request.entryAt)) / 60_000,
  );
  requireContract(Array.isArray(value.parkingLots) && Array.isArray(value.recommendedParkingLots));
  requireContract(
    value.parkingLots.every((item) => {
      if (!isRecord(item) || !isRecord(item.operation) || !isRecord(item.sortRanks)) return false;
      const feeCalculated = item.feeCalculationStatus === 'CALCULATED';
      const operation = item.operation.status;
      return (
        isNonEmptyString(item.parkingLotId) &&
        isNonEmptyString(item.name) &&
        isNonEmptyString(item.address) &&
        isCoordinate(item.location) &&
        isNonNegativeInteger(item.distanceMeters) &&
        item.distanceMeters <= 600 &&
        isNullableNonNegativeInteger(item.estimatedFee) &&
        (feeCalculated || item.feeCalculationStatus === 'UNAVAILABLE') &&
        (operation === 'AVAILABLE' || operation === 'UNAVAILABLE' || operation === 'UNKNOWN') &&
        isInteger(item.sortRanks.distance) &&
        item.sortRanks.distance > 0 &&
        isPositiveIntegerOrNull(item.sortRanks.price) &&
        isPositiveIntegerOrNull(item.sortRanks.balanced) &&
        (item.estimatedFee !== null) === feeCalculated &&
        (item.sortRanks.price !== null) === feeCalculated &&
        (item.sortRanks.balanced !== null) === (feeCalculated && operation === 'AVAILABLE')
      );
    }),
  );
  const lots = value.parkingLots as unknown as ParkingLotSummary[];
  requireContract(
    ranksAreContinuous(lots, 'distance') && ranksAreContinuous(lots, 'price') && ranksAreContinuous(lots, 'balanced'),
  );
  const ids = new Set(lots.map(({ parkingLotId }) => parkingLotId));
  const recommendationIds = new Set<string>();
  const recommendationTypes = new Set<SortCategory>();
  let previousOrder = -1;
  requireContract(value.recommendedParkingLots.length <= 3);
  requireContract(
    value.recommendedParkingLots.every((item) => {
      if (
        !isRecord(item) ||
        !isNonEmptyString(item.parkingLotId) ||
        !categoryOrder.includes(item.recommendationType as SortCategory)
      )
        return false;
      const type = item.recommendationType as SortCategory;
      const order = categoryOrder.indexOf(type);
      const lot = lots.find(({ parkingLotId }) => parkingLotId === item.parkingLotId);
      const valid =
        ids.has(item.parkingLotId) &&
        !recommendationIds.has(item.parkingLotId) &&
        !recommendationTypes.has(type) &&
        order > previousOrder &&
        lot?.operation.status === 'AVAILABLE' &&
        lot.feeCalculationStatus === 'CALCULATED' &&
        lot.sortRanks.balanced !== null;
      recommendationIds.add(item.parkingLotId);
      recommendationTypes.add(type);
      previousOrder = order;
      return valid;
    }),
  );
  return value as unknown as ParkingSearchResponse;
};

export const parseParkingDetailResponse = (value: unknown, parkingLotId: string): ParkingLotDetailResponse => {
  requireContract(isRecord(value) && !hasDeprecatedField(value));
  requireContract(
    value.parkingLotId === parkingLotId &&
      isNonEmptyString(value.name) &&
      isNonEmptyString(value.address) &&
      isCoordinate(value.location),
  );
  requireContract(
    isNullableNonNegativeInteger(value.distanceMeters) && isNullableNonNegativeInteger(value.estimatedFee),
  );
  requireContract(
    value.feeCalculationStatus === 'CALCULATED' ||
      value.feeCalculationStatus === 'UNAVAILABLE' ||
      value.feeCalculationStatus === 'NOT_REQUESTED',
  );
  requireContract(
    (value.feeCalculationStatus === 'CALCULATED') === (value.estimatedFee !== null) &&
      (value.feeCalculationStatus !== 'NOT_REQUESTED' || value.distanceMeters === null),
  );
  requireContract(value.feeRule === null || isRecord(value.feeRule));
  if (isRecord(value.feeRule)) {
    requireContract(
      isNonNegativeInteger(value.feeRule.baseMinutes) &&
        isNonNegativeInteger(value.feeRule.baseFee) &&
        isNullableNonNegativeInteger(value.feeRule.additionalMinutes) &&
        isNullableNonNegativeInteger(value.feeRule.additionalFee) &&
        isNullableNonNegativeInteger(value.feeRule.dailyMaxFee),
    );
  }
  requireContract(isRecord(value.operation));
  requireContract(
    (value.operation.status === 'AVAILABLE' ||
      value.operation.status === 'UNAVAILABLE' ||
      value.operation.status === 'UNKNOWN' ||
      value.operation.status === 'NOT_REQUESTED') &&
      (value.operation.businessHours === null || typeof value.operation.businessHours === 'string'),
  );
  requireContract(
    isRecord(value.source) &&
      isNonEmptyString(value.source.name) &&
      (value.source.url === null || typeof value.source.url === 'string') &&
      isIsoSeoul(value.source.lastCheckedAt),
  );
  return value as unknown as ParkingLotDetailResponse;
};
