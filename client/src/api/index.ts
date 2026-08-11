/**
 * 구현 선택 지점. 화면은 언제나 여기서 `api` 하나만 가져다 쓴다.
 * 백엔드가 준비되면 .env 의 USE_MOCK_API 만 끄면 된다.
 */

import { httpApi } from './http';
import { mockApi } from './mock';
import type { ParkingApi } from './types';

export const api: ParkingApi = __APP_CONFIG__.useMockApi ? mockApi : httpApi;

export { ApiClientError, type ApiErrorKind } from './errors';
export type { ParkingApi } from './types';
