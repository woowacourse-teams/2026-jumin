/** 도메인 모델과 wire 타입. 다른 계층은 모두 이 타입에 의존한다. */

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
