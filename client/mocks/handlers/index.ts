import { destinationHandlers } from './destinationHandlers';
import { parkingDetailHandlers } from './parkingDetailHandlers';
import { parkingLikeHandlers } from './parkingLikeHandlers';
import { parkingSearchHandlers } from './parkingSearchHandlers';
import { parkingViewportDetailHandlers } from './parkingViewportDetailHandlers';
import { parkingViewportHandlers } from './parkingViewportHandlers';
import { reportParkingDataHandlers } from './reportParkingDataHandlers';

export const handlers = [
  ...destinationHandlers,
  ...parkingSearchHandlers,
  ...reportParkingDataHandlers,
  ...parkingLikeHandlers,

  // 구체적인 viewport 경로를 먼저 등록
  ...parkingViewportHandlers,
  ...parkingViewportDetailHandlers,

  // 동적 경로는 나중에 등록
  ...parkingDetailHandlers,
];
