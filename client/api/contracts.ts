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
