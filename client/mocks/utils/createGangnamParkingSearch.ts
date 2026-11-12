import type {
  AvailabilityStatus,
  ParkingLotDetailResponse,
  ParkingLotSummary,
} from '../../src/api/contracts';
import { gangnamStationParkingLots } from '../fixtures/gangnamStationParkingLots';
import { createMockWalkingRoute } from './createMockWalkingRoute';

type Coordinates = ParkingLotSummary['location'];
type SourceParkingLot = (typeof gangnamStationParkingLots)[number];
type DailyOperation = SourceParkingLot['dailyOperations'][number];
type OperationDay = DailyOperation['day'];

export interface MockSearchCondition {
  destination: Coordinates;
  /** +09:00 오프셋을 포함한 ISO 시각. */
  entryAt: string;
  exitAt: string;
}

/** 서버의 검색 반경과 같다. 도보 거리가 이 값을 넘는 주차장은 추천하지 않는다. */
export const SEARCH_RADIUS_METERS = 600;
/** 추천 3곳과 더보기 주차장을 합친 최대 개수. */
const MAX_PARKING_LOTS = 15;
/** 서버의 도보 시간 계산과 같은 걷는 속도(m/분, 시속 4km). */
const WALKING_METERS_PER_MINUTE = 4_000 / 60;
/** 실제 주차장이 모여 있는 강남역 11번 출구. 다른 지역을 검색하면 이 기준으로 옮겨 배치한다. */
const SOURCE_CENTER: Coordinates = { latitude: 37.4981, longitude: 127.0279 };
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const getDistanceMeters = (from: Coordinates, to: Coordinates) => {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
};

const getRouteLength = (route: Coordinates[]) =>
  route
    .slice(1)
    .reduce((sum, coordinate, index) => sum + getDistanceMeters(route[index]!, coordinate), 0);

/**
 * 목적지 주변에 실제 주차장이 없으면(강남역 일대가 아니면) 주차장 전체를 목적지 쪽으로 옮긴다.
 * 강남역 일대를 검색하면 홈 지도와 같은 좌표를 그대로 쓴다.
 */
const getLocationOffset = (destination: Coordinates): Coordinates => {
  const hasNearbyParkingLot = gangnamStationParkingLots.some(
    (parkingLot) => getDistanceMeters(parkingLot, destination) <= SEARCH_RADIUS_METERS,
  );

  if (hasNearbyParkingLot) return { latitude: 0, longitude: 0 };

  return {
    latitude: destination.latitude - SOURCE_CENTER.latitude,
    longitude: destination.longitude - SOURCE_CENTER.longitude,
  };
};

/** 한국 시각 기준의 요일 구분. 일요일은 공휴일 운영 정보를 따른다. */
const getOperationDay = (time: number): OperationDay => {
  const day = new Date(time + KST_OFFSET_MS).getUTCDay();
  if (day === 6) return 'SATURDAY';
  if (day === 0) return 'HOLIDAY';
  return 'WEEKDAY';
};

const getMinutesOfDay = (time: number) => {
  const kst = new Date(time + KST_OFFSET_MS);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
};

const parseMinutes = (value: string) => {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const findOperation = (parkingLot: SourceParkingLot, day: OperationDay) =>
  parkingLot.dailyOperations.find((operation) => operation.day === day);

const getStatusAt = (parkingLot: SourceParkingLot, time: number): AvailabilityStatus => {
  const operation = findOperation(parkingLot, getOperationDay(time));

  if (!operation || operation.status === 'UNKNOWN') return 'UNKNOWN';
  if (operation.status === 'CLOSED') return 'UNAVAILABLE';
  if (operation.openTime === null || operation.closeTime === null) return 'UNKNOWN';

  const open = parseMinutes(operation.openTime);
  const close = parseMinutes(operation.closeTime);
  const now = getMinutesOfDay(time);

  // 여는 시각과 닫는 시각이 같으면 24시간 운영이다.
  if (open === close) return 'AVAILABLE';
  const isOpen = open < close ? now >= open && now < close : now >= open || now < close;

  return isOpen ? 'AVAILABLE' : 'UNAVAILABLE';
};

/**
 * 입차부터 출차까지 10분 간격으로 운영 여부를 확인한다.
 * 서버(ParkingOperationEvaluator)처럼 한 번이라도 닫혀 있으면 이용 불가, 모르는 구간이 있으면 확인 필요다.
 * 전날 밤부터 이어지는 운영 시간은 따로 계산하지 않는 단순화한 규칙이다.
 */
const getAvailabilityStatus = (
  parkingLot: SourceParkingLot,
  entryTime: number,
  exitTime: number,
): AvailabilityStatus => {
  let hasUnknown = false;

  for (let time = entryTime; time < exitTime; time += TEN_MINUTES_MS) {
    const status = getStatusAt(parkingLot, time);
    if (status === 'UNAVAILABLE') return 'UNAVAILABLE';
    if (status === 'UNKNOWN') hasUnknown = true;
  }

  return hasUnknown ? 'UNKNOWN' : 'AVAILABLE';
};

/** 서버의 ParkingOperation.calculateFee와 같은 규칙으로 예상 요금을 계산한다. */
const calculateFee = (
  parkingLot: SourceParkingLot,
  durationMinutes: number,
  entryTime: number,
): number | null => {
  const paid = findOperation(parkingLot, getOperationDay(entryTime))?.paid ?? null;
  if (durationMinutes <= 0 || paid === null) return null;
  if (!paid) return 0;
  if (parkingLot.feeRule === null) return null;

  const { baseFreeMinutes, baseMinutes, baseFee, additionalMinutes, additionalFee, dailyMaxFee } =
    parkingLot.feeRule;
  const isNonNegative = (value: number | null): value is number => value !== null && value >= 0;
  const withDailyMax = (fee: number) =>
    dailyMaxFee !== null && dailyMaxFee > 0 ? Math.min(fee, dailyMaxFee) : fee;

  if (
    !(baseFreeMinutes === null || baseFreeMinutes >= 0) ||
    !isNonNegative(baseMinutes) ||
    !isNonNegative(baseFee)
  ) {
    return null;
  }

  const paidMinutes = durationMinutes - (baseFreeMinutes ?? 0);
  if (paidMinutes <= 0) return withDailyMax(0);
  if (paidMinutes <= baseMinutes) return withDailyMax(baseFee);
  if (baseFee === 0 && additionalFee === 0) return withDailyMax(0);
  if (additionalMinutes === null || additionalMinutes <= 0 || !isNonNegative(additionalFee)) {
    return null;
  }

  const units = Math.ceil((paidMinutes - baseMinutes) / additionalMinutes);
  return withDailyMax(baseFee + units * additionalFee);
};

/** 서버의 ParkingBalancedScoreCalculator와 같은 규칙. 낮을수록 거리와 가격의 균형이 좋다. */
const calculateBalancedScore = (
  availabilityStatus: AvailabilityStatus,
  distanceMeters: number,
  estimatedFee: number | null,
  durationMinutes: number,
) => {
  if (availabilityStatus !== 'AVAILABLE' || estimatedFee === null) return null;

  const referenceFee = (durationMinutes * 1_500) / 10;
  const normalize = (value: number, reference: number) =>
    Math.min(Math.max(value / reference, 0), 1);
  const score =
    (normalize(distanceMeters, SEARCH_RADIUS_METERS) + normalize(estimatedFee, referenceFee)) / 2;

  return Math.round(score * 10_000) / 10_000;
};

interface EvaluatedParkingLot {
  source: SourceParkingLot;
  summary: ParkingLotSummary;
}

const evaluateParkingLot = (
  source: SourceParkingLot,
  { destination, entryAt, exitAt }: MockSearchCondition,
  offset: Coordinates,
): EvaluatedParkingLot => {
  const location = {
    latitude: source.latitude + offset.latitude,
    longitude: source.longitude + offset.longitude,
  };
  const walkingRoute = createMockWalkingRoute(source.id, location, destination);
  // 지도에 그리는 경로의 길이를 그대로 도보 거리로 쓴다.
  const distanceMeters = Math.round(getRouteLength(walkingRoute));
  const entryTime = Date.parse(entryAt);
  const exitTime = Date.parse(exitAt);
  const durationMinutes = Math.round((exitTime - entryTime) / 60_000);
  const availabilityStatus = getAvailabilityStatus(source, entryTime, exitTime);
  const estimatedFee = calculateFee(source, durationMinutes, entryTime);

  return {
    source,
    summary: {
      id: source.id,
      name: source.name,
      address: source.address,
      location,
      distanceMeters,
      walkingDurationMinutes: Math.ceil(distanceMeters / WALKING_METERS_PER_MINUTE),
      estimatedFee,
      balancedScore: calculateBalancedScore(
        availabilityStatus,
        distanceMeters,
        estimatedFee,
        durationMinutes,
      ),
      availabilityStatus,
      walkingRoute,
    },
  };
};

const evaluateNearbyParkingLots = (condition: MockSearchCondition) => {
  const offset = getLocationOffset(condition.destination);

  return gangnamStationParkingLots
    .map((source) => evaluateParkingLot(source, condition, offset))
    .filter(({ summary }) => summary.distanceMeters! <= SEARCH_RADIUS_METERS)
    .sort((first, second) => first.summary.distanceMeters! - second.summary.distanceMeters!)
    .slice(0, MAX_PARKING_LOTS);
};

/**
 * 홈 지도의 실제 주차장(강남역 일대 CSV) 중 목적지에서 가까운 최대 15곳을 추천 응답으로 만든다.
 * 도보 거리는 목 도보 경로의 길이이고, 요금·운영 여부·균형 점수는 서버 규칙을 따른다.
 */
export const searchGangnamParkingLots = (condition: MockSearchCondition): ParkingLotSummary[] =>
  evaluateNearbyParkingLots(condition).map(({ summary }) => summary);

const toOperationPeriod = (operation: DailyOperation | undefined) => ({
  status: operation?.status ?? 'UNKNOWN',
  openTime: operation?.openTime ?? null,
  closeTime: operation?.closeTime ?? null,
  paid: operation?.paid ?? null,
});

/** 추천 응답과 같은 계산으로 상세 응답을 만든다. 실제 주차장이 아니면 null이다. */
export const getGangnamParkingLotDetail = (
  parkingLotId: number,
  condition: MockSearchCondition,
): ParkingLotDetailResponse | null => {
  const source = gangnamStationParkingLots.find(({ id }) => id === parkingLotId);
  if (!source) return null;

  const { summary } = evaluateParkingLot(
    source,
    condition,
    getLocationOffset(condition.destination),
  );

  return {
    id: summary.id,
    name: summary.name,
    address: summary.address,
    location: summary.location,
    capacity: source.capacity,
    availableSpaces: null,
    distanceMeters: summary.distanceMeters,
    walkingDurationMinutes: summary.walkingDurationMinutes,
    estimatedFee: summary.estimatedFee,
    feeCalculationStatus: summary.estimatedFee === null ? 'UNAVAILABLE' : 'CALCULATED',
    feeRule: source.feeRule,
    operation: {
      availabilityStatus: summary.availabilityStatus,
      weekday: toOperationPeriod(findOperation(source, 'WEEKDAY')),
      weekend: toOperationPeriod(findOperation(source, 'SATURDAY')),
      holiday: toOperationPeriod(findOperation(source, 'HOLIDAY')),
    },
  };
};
