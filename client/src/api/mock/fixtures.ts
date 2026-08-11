/** mock 응답 데이터. 실제 API DTO와 같은 모양을 유지한다. */

import type {
  DestinationSearchResponse,
  DetailSearchCondition,
  ParkingLotDetailResponse,
  ParkingLotSummary,
  ParkingSearchRequest,
  ParkingSearchResponse,
} from '../../domain';

export const mockDelay = (signal?: AbortSignal) =>
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

export const MOCK_DESTINATIONS: DestinationSearchResponse['destinations'] = [
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

export const MOCK_LOTS: ParkingLotSummary[] = [
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

export const makeSearchResponse = (request: ParkingSearchRequest): ParkingSearchResponse => {
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

export const detailFromLot = (lot: ParkingLotSummary, condition?: DetailSearchCondition): ParkingLotDetailResponse => ({
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
