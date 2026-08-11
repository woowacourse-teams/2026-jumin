export type SortCategory = 'DISTANCE' | 'PRICE' | 'BALANCED';
export type OperationStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
export type FeeCalculationStatus = 'CALCULATED' | 'UNAVAILABLE';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface SearchDestination {
  kind: 'SEARCH';
  destinationId: string;
  name: string;
  address: string;
  roadAddress: string | null;
  location: Coordinate;
}

export interface NearbyDestination {
  kind: 'NEARBY';
  name: '현재 위치';
  address: '현재 위치 주변';
  location: Coordinate;
}

export type Destination = SearchDestination | NearbyDestination;

export interface VisitDraft {
  source: 'SEARCH' | 'NEARBY';
  visitDate: string;
  entryTime: string | null;
  exitTime: string | null;
  nearbyExitWasEdited: boolean;
}

export interface ConfirmedVisitCondition {
  entryAt: string;
  exitAt: string;
  durationMinutes: number;
}

export interface DestinationCandidate {
  destinationId: string;
  name: string;
  address: string;
  roadAddress: string | null;
  latitude: number;
  longitude: number;
  distanceFromCurrentLocationMeters: number | null;
  provider: 'NAVER';
}

export interface DestinationSearchResponse {
  query: string;
  destinations: DestinationCandidate[];
}

export interface SortRanks {
  distance: number;
  price: number | null;
  balanced: number | null;
}

export interface ParkingLotSummary {
  parkingLotId: string;
  name: string;
  address: string;
  location: Coordinate;
  distanceMeters: number;
  estimatedFee: number | null;
  feeCalculationStatus: FeeCalculationStatus;
  operation: { status: OperationStatus };
  sortRanks: SortRanks;
}

export interface RecommendedParkingLotRef {
  parkingLotId: string;
  recommendationType: SortCategory;
}

export interface ParkingSearchResponse {
  searchCondition: {
    destination: { name: string | null; latitude: number; longitude: number };
    entryAt: string;
    exitAt: string;
    durationMinutes: number;
  };
  searchRadiusMeters: 600;
  parkingLots: ParkingLotSummary[];
  recommendedParkingLots: RecommendedParkingLotRef[];
}

export interface ParkingLotDetailResponse {
  parkingLotId: string;
  name: string;
  address: string;
  location: Coordinate;
  distanceMeters: number | null;
  estimatedFee: number | null;
  feeCalculationStatus: FeeCalculationStatus | 'NOT_REQUESTED';
  feeRule: {
    baseMinutes: number;
    baseFee: number;
    additionalMinutes: number | null;
    additionalFee: number | null;
    dailyMaxFee: number | null;
  } | null;
  operation: {
    status: OperationStatus | 'NOT_REQUESTED';
    businessHours: string | null;
  };
  source: { name: string; url: string | null; lastCheckedAt: string };
}

export interface SearchSession {
  destination: Destination | null;
  visitDraft: VisitDraft | null;
  confirmedVisit: ConfirmedVisitCondition | null;
  response: ParkingSearchResponse | null;
  selectedCategory: SortCategory;
  selectedParkingLotId: string | null;
}

export const EMPTY_SESSION: SearchSession = {
  destination: null,
  visitDraft: null,
  confirmedVisit: null,
  response: null,
  selectedCategory: 'BALANCED',
  selectedParkingLotId: null,
};

export interface ParkingSearchRequest {
  destinationName?: string;
  destinationLatitude: number;
  destinationLongitude: number;
  entryAt: string;
  exitAt: string;
}

export interface DetailSearchCondition {
  destinationLatitude: number;
  destinationLongitude: number;
  entryAt: string;
  exitAt: string;
}

export interface RecentUse {
  parkingLotId: string;
  name: string;
  address: string;
  location: Coordinate;
  usedAt: string;
}

export interface ParkingTarget {
  parkingLotId: string;
  name: string;
  address: string;
  location: Coordinate;
}

const SEOUL_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const seoulParts = (date: Date) => {
  const parts = Object.fromEntries(SEOUL_FORMATTER.formatToParts(date).map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
};

export const todayInSeoul = (now = new Date()) => seoulParts(now).date;

export const nextTenMinuteSlot = (now = new Date()) => {
  const next = new Date(Math.floor(now.getTime() / 600_000) * 600_000 + 600_000);
  return seoulParts(next);
};

export const addDays = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00+09:00`);
  value.setUTCDate(value.getUTCDate() + amount);
  return seoulParts(value).date;
};

export const toIsoAtSeoul = (date: string, time: string) => `${date}T${time}:00+09:00`;

const minuteOfDay = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export const deriveVisit = (draft: VisitDraft): ConfirmedVisitCondition | null => {
  if (!draft.entryTime || !draft.exitTime) return null;
  const exitDate =
    minuteOfDay(draft.exitTime) > minuteOfDay(draft.entryTime) ? draft.visitDate : addDays(draft.visitDate, 1);
  const entryAt = toIsoAtSeoul(draft.visitDate, draft.entryTime);
  const exitAt = toIsoAtSeoul(exitDate, draft.exitTime);
  return { entryAt, exitAt, durationMinutes: (Date.parse(exitAt) - Date.parse(entryAt)) / 60_000 };
};

export const initialNearbyVisit = (now = new Date()): VisitDraft => {
  const entry = nextTenMinuteSlot(now);
  const exit = seoulParts(new Date(Date.parse(toIsoAtSeoul(entry.date, entry.time)) + 60 * 60_000));
  return {
    source: 'NEARBY',
    visitDate: entry.date,
    entryTime: entry.time,
    exitTime: exit.time,
    nearbyExitWasEdited: false,
  };
};

export type VisitValidation = { field: 'entryAt' | 'exitAt' | 'timeRange'; message: string } | null;

export const validateVisit = (draft: VisitDraft, now = new Date()): VisitValidation => {
  if (!draft.entryTime || !draft.exitTime)
    return { field: !draft.entryTime ? 'entryAt' : 'exitAt', message: '입차 시간과 출차 시간을 모두 선택해주세요.' };
  if (minuteOfDay(draft.entryTime) % 10 || minuteOfDay(draft.exitTime) % 10)
    return { field: 'timeRange', message: '10분 단위의 시간을 선택해주세요.' };
  const visit = deriveVisit(draft);
  if (!visit || Date.parse(visit.entryAt) <= now.getTime())
    return { field: 'entryAt', message: '현재 이후의 입차 시간을 선택해주세요.' };
  if (visit.durationMinutes < 10 || visit.durationMinutes > 1_440)
    return { field: 'timeRange', message: '출차 시간은 입차 시간보다 늦어야 해요.' };
  return null;
};

export const addVisitMinutes = (draft: VisitDraft, amount: number): VisitDraft | null => {
  if (!draft.entryTime) return null;
  const entryAt = toIsoAtSeoul(draft.visitDate, draft.entryTime);
  const current = deriveVisit(draft);
  const base = current?.exitAt ?? entryAt;
  const exit = new Date(Date.parse(base) + amount * 60_000);
  if ((exit.getTime() - Date.parse(entryAt)) / 60_000 > 1_440) return null;
  return {
    ...draft,
    exitTime: seoulParts(exit).time,
    nearbyExitWasEdited: draft.source === 'NEARBY' || draft.nearbyExitWasEdited,
  };
};

export const syncVisitFromResponse = (draft: VisitDraft, confirmed: ConfirmedVisitCondition): VisitDraft => ({
  ...draft,
  visitDate: confirmed.entryAt.slice(0, 10),
  entryTime: confirmed.entryAt.slice(11, 16),
  exitTime: confirmed.exitAt.slice(11, 16),
});

export const refreshNearbyVisit = (draft: VisitDraft, now = new Date()): VisitDraft => {
  const current = deriveVisit(draft);
  if (!current || Date.parse(current.entryAt) > now.getTime()) return draft;
  const next = nextTenMinuteSlot(now);
  if (!draft.nearbyExitWasEdited) {
    const exit = seoulParts(new Date(Date.parse(toIsoAtSeoul(next.date, next.time)) + 60 * 60_000));
    return { ...draft, visitDate: next.date, entryTime: next.time, exitTime: exit.time };
  }
  return { ...draft, visitDate: next.date, entryTime: next.time };
};

const rankFor = (lot: ParkingLotSummary, category: SortCategory) =>
  category === 'DISTANCE'
    ? lot.sortRanks.distance
    : category === 'PRICE'
      ? lot.sortRanks.price
      : lot.sortRanks.balanced;

/**
 * 해당 정렬 기준의 rank가 있는지. 백엔드는 요금 계산 불가면 `price`를,
 * 요금 계산 불가이거나 운영 불가면 `balanced`를 null로 준다.
 */
export const isSortableBy = (lot: ParkingLotSummary, category: SortCategory) => rankFor(lot, category) !== null;

export const sortParkingLots = (lots: ParkingLotSummary[], category: SortCategory) =>
  [...lots].sort((a, b) => {
    const left = rankFor(a, category);
    const right = rankFor(b, category);
    if (left !== null && right === null) return -1;
    if (left === null && right !== null) return 1;
    if (left !== null && right !== null && left !== right) return left - right;
    return a.sortRanks.distance - b.sortRanks.distance || a.parkingLotId.localeCompare(b.parkingLotId);
  });

export const recommendationLabel = (category: SortCategory) =>
  ({ DISTANCE: '거리 우선', PRICE: '가격 우선', BALANCED: '균형' })[category];

export const operationLabel = (status: OperationStatus | 'NOT_REQUESTED') =>
  ({ AVAILABLE: '이용 가능', UNAVAILABLE: '운영 불가', UNKNOWN: '운영 확인 필요', NOT_REQUESTED: '운영 정보' })[status];

export const formatFee = (fee: number | null, status: FeeCalculationStatus | 'NOT_REQUESTED') => {
  if (status === 'UNAVAILABLE' || fee === null) return '요금 계산 불가';
  return fee === 0 ? '무료' : `${new Intl.NumberFormat('ko-KR').format(fee)}원`;
};

export const formatDistance = (meters: number) => (meters < 1_000 ? `${meters}m` : `${(meters / 1_000).toFixed(1)}km`);

export const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
};

export const formatVisit = ({ entryAt, exitAt }: ConfirmedVisitCondition) => {
  const entry = new Date(entryAt);
  const exit = new Date(exitAt);
  const start = seoulParts(entry);
  const end = seoulParts(exit);
  const dateLabel = `${Number(start.date.slice(5, 7))}월 ${Number(start.date.slice(8, 10))}일`;
  return start.date === end.date
    ? `${dateLabel} ${start.time}–${end.time}`
    : `${dateLabel} ${start.time}–다음 날 ${end.time}`;
};

export const formatCheckedAt = (value: string) => {
  const { date, time } = seoulParts(new Date(value));
  return `${date.replaceAll('-', '.')} ${time} 기준`;
};

export const formatRecentAt = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isInteger = (value: unknown): value is number => Number.isInteger(value);
const isNonNegativeInteger = (value: unknown): value is number => isInteger(value) && value >= 0;
const isNullableNonNegativeInteger = (value: unknown): value is number | null =>
  value === null || isNonNegativeInteger(value);
const isPositiveIntegerOrNull = (value: unknown): value is number | null =>
  value === null || (isInteger(value) && value > 0);
const isCoordinate = (value: unknown): value is Coordinate =>
  isRecord(value) &&
  typeof value.latitude === 'number' &&
  Number.isFinite(value.latitude) &&
  value.latitude >= -90 &&
  value.latitude <= 90 &&
  typeof value.longitude === 'number' &&
  Number.isFinite(value.longitude) &&
  value.longitude >= -180 &&
  value.longitude <= 180;
const isIsoSeoul = (value: unknown): value is string =>
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

const RECENT_KEY = 'parking-people:recent-uses:v1';

const cleanRecentItems = (items: unknown, now = new Date()): RecentUse[] => {
  if (!Array.isArray(items)) return [];
  const cutoff = now.getTime() - 90 * 24 * 60 * 60_000;
  const seen = new Set<string>();
  return items
    .filter(
      (item): item is RecentUse =>
        isRecord(item) &&
        isNonEmptyString(item.parkingLotId) &&
        isNonEmptyString(item.name) &&
        isNonEmptyString(item.address) &&
        isCoordinate(item.location) &&
        isIsoSeoul(item.usedAt) &&
        Date.parse(item.usedAt) >= cutoff,
    )
    .sort((a, b) => Date.parse(b.usedAt) - Date.parse(a.usedAt))
    .filter((item) => !seen.has(item.parkingLotId) && Boolean(seen.add(item.parkingLotId)))
    .slice(0, 20);
};

export const loadRecentUses = (now = new Date()): RecentUse[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? 'null');
    const items = isRecord(parsed) && parsed.version === 1 ? cleanRecentItems(parsed.items, now) : [];
    localStorage.setItem(RECENT_KEY, JSON.stringify({ version: 1, items }));
    return items;
  } catch {
    return [];
  }
};

export const saveRecentUse = (target: ParkingTarget, now = new Date()) => {
  const usedAt = `${seoulParts(now).date}T${seoulParts(now).time}:00+09:00`;
  const items = cleanRecentItems([{ ...target, usedAt }, ...loadRecentUses(now)], now);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify({ version: 1, items }));
  } catch {
    // 최근 이용 저장 실패가 길찾기를 막지 않는다.
  }
};

export type DirectionsProvider = 'NAVER' | 'KAKAO' | 'TMAP';

export const buildDirectionsUrl = (
  provider: DirectionsProvider,
  target: ParkingTarget,
  config: { naverMapAppName: string; tmapAppKey: string },
) => {
  if (provider === 'NAVER') {
    if (!config.naverMapAppName) return null;
    const url = new URL('nmap://route/car');
    url.search = new URLSearchParams({
      dlat: String(target.location.latitude),
      dlng: String(target.location.longitude),
      dname: target.name,
      appname: config.naverMapAppName,
    }).toString();
    return url.toString();
  }
  if (provider === 'KAKAO')
    return `https://map.kakao.com/link/to/${encodeURIComponent(target.name)},${target.location.latitude},${target.location.longitude}`;
  if (!config.tmapAppKey) return null;
  const url = new URL('https://apis.openapi.sk.com/tmap/app/routes');
  url.search = new URLSearchParams({
    appKey: config.tmapAppKey,
    goalname: target.name,
    goalx: String(target.location.longitude),
    goaly: String(target.location.latitude),
  }).toString();
  return url.toString();
};

export const runDomainSelfCheck = () => {
  const nearby = deriveVisit(initialNearbyVisit(new Date('2026-08-11T14:01:00Z')));
  if (nearby?.entryAt !== '2026-08-11T23:10:00+09:00' || nearby.exitAt !== '2026-08-12T00:10:00+09:00')
    throw new Error('주변 방문 시각 self-check 실패');
  const lots: ParkingLotSummary[] = [
    {
      parkingLotId: 'b',
      name: 'b',
      address: 'b',
      location: { latitude: 0, longitude: 0 },
      distanceMeters: 2,
      estimatedFee: null,
      feeCalculationStatus: 'UNAVAILABLE',
      operation: { status: 'UNKNOWN' },
      sortRanks: { distance: 2, price: null, balanced: null },
    },
    {
      parkingLotId: 'a',
      name: 'a',
      address: 'a',
      location: { latitude: 0, longitude: 0 },
      distanceMeters: 1,
      estimatedFee: 0,
      feeCalculationStatus: 'CALCULATED',
      operation: { status: 'AVAILABLE' },
      sortRanks: { distance: 1, price: 1, balanced: 1 },
    },
  ];
  if (sortParkingLots(lots, 'PRICE')[0]?.parkingLotId !== 'a') throw new Error('정렬 self-check 실패');
  const target = { ...lots[1]!, name: '강남 역', location: { latitude: 37.5, longitude: 127 } };
  const config = { naverMapAppName: 'com.example.app', tmapAppKey: 'key' };
  const naver = buildDirectionsUrl('NAVER', target, config);
  const kakao = buildDirectionsUrl('KAKAO', target, config);
  const tmap = buildDirectionsUrl('TMAP', target, config);
  if (
    !naver?.startsWith('nmap://route/car?') ||
    new URL(naver).searchParams.get('dlat') !== '37.5' ||
    new URL(naver).searchParams.get('dlng') !== '127' ||
    kakao !== 'https://map.kakao.com/link/to/%EA%B0%95%EB%82%A8%20%EC%97%AD,37.5,127' ||
    !tmap ||
    new URL(tmap).searchParams.get('goalx') !== '127' ||
    new URL(tmap).searchParams.get('goaly') !== '37.5'
  )
    throw new Error('길찾기 self-check 실패');
};
