import { destinationHandlers } from './destinationHandlers';
import { parkingSearchHandlers } from './parkingSearchHandlers';

export const handlers = [...destinationHandlers, ...parkingSearchHandlers];
