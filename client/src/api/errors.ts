/** API 호출 실패를 화면이 이해할 수 있는 종류로 좁힌 예외. */

export type ApiErrorKind = 'NETWORK' | 'TIMEOUT' | 'RATE_LIMIT' | 'NOT_FOUND' | 'CONTRACT' | 'SERVER' | 'VALIDATION';

export class ApiClientError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    public readonly code: string,
    public readonly status = 0,
  ) {
    super(code);
  }
}
