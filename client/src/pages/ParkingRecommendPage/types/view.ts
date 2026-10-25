export type RecommendationType = 'PRICE' | 'DISTANCE' | 'BALANCED';

export type RecommendView = {
  parkingLotId: number | null;
  recommendationType: RecommendationType;
};
