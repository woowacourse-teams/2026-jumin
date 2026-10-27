import type { BottomSheetSnap } from '../../../../shared/types/ui';

export type RecommendationType = 'PRICE' | 'DISTANCE' | 'BALANCED';

export type RecommendView = {
  parkingLotId: number | null;
  recommendationType: RecommendationType;
  sheetSnap: BottomSheetSnap;
};
