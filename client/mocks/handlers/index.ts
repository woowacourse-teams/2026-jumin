import { destinationHandlers } from './destinationHandlers';
import { parkingDetailHandlers } from './parkingDetailHandlers';
import { parkingSearchHandlers } from './parkingSearchHandlers';
import { parkingViewportDetailHandlers } from './parkingViewportDetailHandlers';

export const handlers = [
  ...destinationHandlers,
  ...parkingSearchHandlers,
  ...parkingDetailHandlers,
  ...parkingViewportDetailHandlers,
];
