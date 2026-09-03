export type DestinationProvider = 'NAVER';

export interface Destination {
  destinationId: string;
  name: string;
  address: string;
  roadAddress: string | null;
  latitude: number;
  longitude: number;
  provider: DestinationProvider;
}

export interface DestinationSearchResponse {
  query: string;
  destinations: Destination[];
}

export interface DestinationNameResponse {
  displayName: string;
}

export type AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';

export interface ParkingLotSummary {
  id: number;
  name: string;
  address: string;
  location: {
    latitude: number;
    longitude: number;
  };
  distanceMeters: number;
  estimatedFee: number | null;
  balancedScore: number | null;
  availabilityStatus: AvailabilityStatus;
}

export interface ParkingSearchResponse {
  searchRadiusMeters: 600;
  totalCount: number;
  parkingLots: ParkingLotSummary[];
}

export type FeeCalculationStatus = 'CALCULATED' | 'UNAVAILABLE';
export type ParkingOperationStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export interface ParkingFeeRule {
  baseFreeMinutes: number | null;
  baseMinutes: number | null;
  baseFee: number | null;
  additionalMinutes: number | null;
  additionalFee: number | null;
  dailyMaxFee: number | null;
  monthlyFee: number | null;
}

export interface ParkingOperationPeriod {
  status: ParkingOperationStatus;
  openTime: string | null;
  closeTime: string | null;
  paid: boolean | null;
}

export interface ParkingOperation {
  availabilityStatus: AvailabilityStatus;
  weekday: ParkingOperationPeriod;
  weekend: ParkingOperationPeriod;
  holiday: ParkingOperationPeriod;
}

export interface ParkingInformationSource {
  name: string;
  url: string | null;
  lastCheckedAt: string;
}

export interface ParkingLotDetailResponse {
  id: number;
  name: string;
  address: string;
  location: {
    latitude: number;
    longitude: number;
  };
  capacity: number | null;
  distanceMeters: number;
  estimatedFee: number | null;
  feeCalculationStatus: FeeCalculationStatus;
  feeRule: ParkingFeeRule | null;
  operation: ParkingOperation;
  source?: ParkingInformationSource;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ValidationErrorResponse {
  message: string;
  errors: FieldError[];
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  traceId: string | null;
}
