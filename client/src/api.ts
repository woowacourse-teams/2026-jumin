import {
  ContractError,
  type Coordinate,
  type DestinationSearchResponse,
  type DetailSearchCondition,
  type ParkingLotDetailResponse,
  type ParkingLotSummary,
  type ParkingSearchRequest,
  type ParkingSearchResponse,
  parseDestinationSearchResponse,
  parseParkingDetailResponse,
  parseParkingSearchResponse,
} from './domain';

export type ApiErrorKind = 'NETWORK' | 'TIMEOUT' | 'RATE_LIMIT' | 'NOT_FOUND' | 'CONTRACT' | 'SERVER' | 'VALIDATION';

export class ApiClientError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    public readonly code: string,
    public readonly status = 0,
  ) {
    super(code);
  }
}

const mockDelay = (signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 180);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

const MOCK_DESTINATIONS: DestinationSearchResponse['destinations'] = [
  {
    destinationId: 'naver_gangnam_1',
    name: '강남역 신분당선 1번 출구',
    address: '서울 강남구 역삼동 858',
    roadAddress: '서울 강남구 강남대로 396',
    latitude: 37.4978,
    longitude: 127.0282,
    distanceFromCurrentLocationMeters: 1_200,
    provider: 'NAVER',
  },
  {
    destinationId: 'naver_gangnam_11',
    name: '강남역 11번 출구',
    address: '서울 강남구 역삼동 858',
    roadAddress: '서울 강남구 강남대로 396',
    latitude: 37.4981,
    longitude: 127.0279,
    distanceFromCurrentLocationMeters: 1_260,
    provider: 'NAVER',
  },
  {
    destinationId: 'naver_gangnam_square',
    name: '강남스퀘어',
    address: '서울 강남구 역삼동 814-6',
    roadAddress: '서울 강남구 강남대로 396',
    latitude: 37.4973,
    longitude: 127.0287,
    distanceFromCurrentLocationMeters: 1_340,
    provider: 'NAVER',
  },
  {
    destinationId: 'naver_coex',
    name: '코엑스',
    address: '서울 강남구 삼성동 159',
    roadAddress: '서울 강남구 영동대로 513',
    latitude: 37.5125,
    longitude: 127.059,
    distanceFromCurrentLocationMeters: 4_100,
    provider: 'NAVER',
  },
];

const MOCK_LOTS: ParkingLotSummary[] = [
  {
    parkingLotId: 'seoul_public_102',
    name: '역삼1동 문화센터 공영주차장',
    address: '서울 강남구 역삼로7길 16',
    location: { latitude: 37.497, longitude: 127.026 },
    distanceMeters: 210,
    estimatedFee: 7_500,
    feeCalculationStatus: 'CALCULATED',
    operation: { status: 'AVAILABLE' },
    sortRanks: { distance: 1, price: 4, balanced: 3 },
  },
  {
    parkingLotId: 'seoul_public_101',
    name: '역삼문화공원 제1호 공영주차장',
    address: '서울 강남구 테헤란로7길 21',
    location: { latitude: 37.499, longitude: 127.029 },
    distanceMeters: 310,
    estimatedFee: 6_000,
    feeCalculationStatus: 'CALCULATED',
    operation: { status: 'AVAILABLE' },
    sortRanks: { distance: 2, price: 2, balanced: 2 },
  },
  {
    parkingLotId: 'seoul_public_104',
    name: '강남대로 공영주차장',
    address: '서울 강남구 강남대로 382',
    location: { latitude: 37.4962, longitude: 127.0294 },
    distanceMeters: 360,
    estimatedFee: 7_000,
    feeCalculationStatus: 'CALCULATED',
    operation: { status: 'UNAVAILABLE' },
    sortRanks: { distance: 3, price: 3, balanced: null },
  },
  {
    parkingLotId: 'seoul_public_103',
    name: '도곡로21길 공영주차장',
    address: '서울 강남구 도곡로21길 7',
    location: { latitude: 37.501, longitude: 127.031 },
    distanceMeters: 480,
    estimatedFee: 5_000,
    feeCalculationStatus: 'CALCULATED',
    operation: { status: 'AVAILABLE' },
    sortRanks: { distance: 4, price: 1, balanced: 1 },
  },
  {
    parkingLotId: 'seoul_public_105',
    name: '역삼동 노상 공영주차장',
    address: '서울 강남구 테헤란로 인근',
    location: { latitude: 37.5007, longitude: 127.0247 },
    distanceMeters: 570,
    estimatedFee: null,
    feeCalculationStatus: 'UNAVAILABLE',
    operation: { status: 'UNKNOWN' },
    sortRanks: { distance: 5, price: null, balanced: null },
  },
];

const makeSearchResponse = (request: ParkingSearchRequest): ParkingSearchResponse => {
  const empty = request.destinationName?.includes('추천 없음') ?? false;
  return {
    searchCondition: {
      destination: {
        name: request.destinationName ?? null,
        latitude: request.destinationLatitude,
        longitude: request.destinationLongitude,
      },
      entryAt: request.entryAt,
      exitAt: request.exitAt,
      durationMinutes: (Date.parse(request.exitAt) - Date.parse(request.entryAt)) / 60_000,
    },
    searchRadiusMeters: 600,
    parkingLots: empty ? [] : MOCK_LOTS,
    recommendedParkingLots: empty
      ? []
      : [
          { parkingLotId: 'seoul_public_103', recommendationType: 'BALANCED' },
          { parkingLotId: 'seoul_public_102', recommendationType: 'DISTANCE' },
          { parkingLotId: 'seoul_public_101', recommendationType: 'PRICE' },
        ],
  };
};

const detailFromLot = (lot: ParkingLotSummary, condition?: DetailSearchCondition): ParkingLotDetailResponse => ({
  parkingLotId: lot.parkingLotId,
  name: lot.name,
  address: lot.address,
  location: lot.location,
  distanceMeters: condition ? lot.distanceMeters : null,
  estimatedFee: condition ? lot.estimatedFee : null,
  feeCalculationStatus: condition ? lot.feeCalculationStatus : 'NOT_REQUESTED',
  feeRule: {
    baseMinutes: 30,
    baseFee: 3_000,
    additionalMinutes: 10,
    additionalFee: 1_000,
    dailyMaxFee: 30_000,
  },
  operation: {
    status: condition ? lot.operation.status : 'NOT_REQUESTED',
    businessHours: lot.operation.status === 'UNKNOWN' ? null : '매일 00:00–24:00',
  },
  source: {
    name: '서울 열린데이터광장',
    url: 'https://data.seoul.go.kr',
    lastCheckedAt: '2026-08-10T12:00:00+09:00',
  },
});

const parseApiError = async (response: Response) => {
  let code = 'UNKNOWN_API_ERROR';
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string') code = body.code;
  } catch {
    // HTTP status만으로 오류를 분류한다.
  }
  const kind: ApiErrorKind =
    response.status === 429
      ? 'RATE_LIMIT'
      : response.status === 404
        ? 'NOT_FOUND'
        : response.status >= 500
          ? 'SERVER'
          : 'VALIDATION';
  return new ApiClientError(kind, code, response.status);
};

const getJson = async (path: string, params: URLSearchParams, signal?: AbortSignal) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = window.setTimeout(() => controller.abort('timeout'), 10_000);
  try {
    const base = __APP_CONFIG__.apiBaseUrl.replace(/\/$/, '');
    const response = await fetch(`${base}${path}?${params}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await parseApiError(response);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) throw new ContractError('JSON 응답이 아닙니다.');
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof ApiClientError || error instanceof ContractError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (signal?.aborted) throw error;
      throw new ApiClientError('TIMEOUT', 'REQUEST_TIMEOUT');
    }
    throw new ApiClientError('NETWORK', 'NETWORK_ERROR');
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
};

function withContractError<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof ContractError) throw new ApiClientError('CONTRACT', 'CONTRACT_ERROR');
    throw error;
  }
}

export const api = {
  async searchDestinations(query: string, currentLocation?: Coordinate, signal?: AbortSignal) {
    const normalized = query.trim();
    if (__APP_CONFIG__.useMockApi) {
      await mockDelay(signal);
      if (normalized === '검색오류') throw new ApiClientError('NETWORK', 'NAVER_DESTINATION_SEARCH_FAILED', 502);
      const special = normalized.includes('없음')
        ? [
            {
              ...MOCK_DESTINATIONS[0]!,
              destinationId: 'mock_empty',
              name: '추천 없음',
              roadAddress: '서울 강남구 테스트로 0',
            },
          ]
        : normalized.includes('오류')
          ? [
              {
                ...MOCK_DESTINATIONS[0]!,
                destinationId: 'mock_error',
                name: 'API 오류',
                roadAddress: '서울 강남구 테스트로 1',
              },
            ]
          : MOCK_DESTINATIONS.filter((item) =>
              `${item.name} ${item.address} ${item.roadAddress ?? ''}`.includes(normalized),
            );
      const destinations = special.map((item) => ({
        ...item,
        distanceFromCurrentLocationMeters: currentLocation ? item.distanceFromCurrentLocationMeters : null,
      }));
      return parseDestinationSearchResponse({ query: normalized, destinations });
    }
    const params = new URLSearchParams({ query: normalized });
    if (currentLocation) {
      params.set('currentLatitude', String(currentLocation.latitude));
      params.set('currentLongitude', String(currentLocation.longitude));
    }
    const value = await getJson('/api/destinations/search', params, signal);
    const response = withContractError(() => parseDestinationSearchResponse(value));
    if (response.query !== normalized) throw new ApiClientError('CONTRACT', 'CONTRACT_ERROR');
    return response;
  },

  async searchParkingLots(request: ParkingSearchRequest, signal?: AbortSignal) {
    if (__APP_CONFIG__.useMockApi) {
      await mockDelay(signal);
      if (request.destinationName?.includes('API 오류'))
        throw new ApiClientError('SERVER', 'PARKING_SEARCH_FAILED', 500);
      return parseParkingSearchResponse(makeSearchResponse(request), request);
    }
    const params = new URLSearchParams({
      destinationLatitude: String(request.destinationLatitude),
      destinationLongitude: String(request.destinationLongitude),
      entryAt: request.entryAt,
      exitAt: request.exitAt,
    });
    if (request.destinationName) params.set('destinationName', request.destinationName);
    const value = await getJson('/api/parking-lots/search', params, signal);
    return withContractError(() => parseParkingSearchResponse(value, request));
  },

  async getParkingLot(parkingLotId: string, condition?: DetailSearchCondition, signal?: AbortSignal) {
    if (__APP_CONFIG__.useMockApi) {
      await mockDelay(signal);
      const lot = MOCK_LOTS.find((item) => item.parkingLotId === parkingLotId);
      if (!lot) throw new ApiClientError('NOT_FOUND', 'PARKING_LOT_NOT_FOUND', 404);
      return parseParkingDetailResponse(detailFromLot(lot, condition), parkingLotId);
    }
    const params = new URLSearchParams();
    if (condition) {
      params.set('destinationLatitude', String(condition.destinationLatitude));
      params.set('destinationLongitude', String(condition.destinationLongitude));
      params.set('entryAt', condition.entryAt);
      params.set('exitAt', condition.exitAt);
    }
    const value = await getJson(`/api/parking-lots/${encodeURIComponent(parkingLotId)}`, params, signal);
    return withContractError(() => parseParkingDetailResponse(value, parkingLotId));
  },
};
