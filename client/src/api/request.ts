import { ApiError } from './apiError';
import { isAbortError } from './isAbortError';

export async function request(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (cause) {
    options.signal?.throwIfAborted();

    if (isAbortError(cause)) {
      throw cause;
    }

    throw new ApiError(
      {
        errorType: 'network',
      },
      cause,
    );
  }
}
