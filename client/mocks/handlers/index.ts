import { destinationHandlers } from './destinationHandlers';
import { parkingDetailHandlers } from './parkingDetailHandlers';
import { parkingSearchHandlers } from './parkingSearchHandlers';

export const handlers = [
  ...destinationHandlers,
  ...parkingSearchHandlers,
  ...parkingDetailHandlers,
];
