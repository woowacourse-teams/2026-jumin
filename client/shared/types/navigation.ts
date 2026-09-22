export interface ParkingSearchCondition {
  destinationName: string;
  destinationLatitude: number;
  destinationLongitude: number;
  entryAt: string;
  exitAt: string;
}

export interface ParkingDetailCondition {
  parkingLotId: number;
  parkingLotName: string;
  destinationName: string;
  destinationLatitude: number;
  destinationLongitude: number;
  entryAt: string;
  exitAt: string;
}

export type RecommendationType = 'PRICE' | 'DISTANCE' | 'BALANCED';

export type RecommendView = {
  snap: 'expanded' | 'collapsed';
  parkingLotId: number;
  recommendationType: RecommendationType;
};
