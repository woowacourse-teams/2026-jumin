/** HTTP 전송, 타임아웃, 상태코드 → ApiClientError 매핑. */

import { ContractError } from '../domain';
import { ApiClientError, type ApiErrorKind } from './errors';

export const parseApiError = async (response: Response) => {
  let code = 'UNKNOWN_API_ERROR';
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string') code = body.code;
  } catch {
    // HTTP status만으로 오류를 분류한다.
  }
  const kind: ApiErrorKind =
    response.status === 429
      ? 'RATE_LIMIT'
      : response.status === 404
        ? 'NOT_FOUND'
        : response.status >= 500
          ? 'SERVER'
          : 'VALIDATION';
  return new ApiClientError(kind, code, response.status);
};

export const getJson = async (path: string, params: URLSearchParams, signal?: AbortSignal) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = window.setTimeout(() => controller.abort('timeout'), 10_000);
  try {
    const base = __APP_CONFIG__.apiBaseUrl.replace(/\/$/, '');
    const response = await fetch(`${base}${path}?${params}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await parseApiError(response);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) throw new ContractError('JSON 응답이 아닙니다.');
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof ApiClientError || error instanceof ContractError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (signal?.aborted) throw error;
      throw new ApiClientError('TIMEOUT', 'REQUEST_TIMEOUT');
    }
    throw new ApiClientError('NETWORK', 'NETWORK_ERROR');
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
};

export function withContractError<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof ContractError) throw new ApiClientError('CONTRACT', 'CONTRACT_ERROR');
    throw error;
  }
}
