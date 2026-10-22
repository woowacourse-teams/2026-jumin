import { z } from 'zod';

import { ApiError } from './apiError';
import { isAbortError } from './isAbortError';

const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});

const messageSchema = z.string().nullish();
const codeSchema = z.string().nullish();
const fieldErrorsSchema = z.array(fieldErrorSchema);

function parseApiErrorResponse(data: unknown) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      serverMessage: undefined,
      serverCode: undefined,
      fieldErrors: [],
    };
  }

  const response = data as Record<string, unknown>;
  const messageResult = messageSchema.safeParse(response.message);
  const codeResult = codeSchema.safeParse(response.code);
  const fieldErrorsResult = fieldErrorsSchema.safeParse(response.errors);

  return {
    serverMessage: messageResult.success && messageResult.data ? messageResult.data : undefined,
    serverCode: codeResult.success && codeResult.data ? codeResult.data : undefined,
    fieldErrors: fieldErrorsResult.success ? fieldErrorsResult.data : [],
  };
}

export async function throwIfHttpError(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch (cause) {
    if (isAbortError(cause)) {
      throw cause;
    }

    throw new ApiError(
      {
        errorType: 'http',
        status: response.status,
        fieldErrors: [],
      },
      cause,
    );
  }

  const { serverMessage, serverCode, fieldErrors } = parseApiErrorResponse(data);

  throw new ApiError({
    errorType: 'http',
    status: response.status,
    serverMessage,
    serverCode,
    fieldErrors,
  });
}

export async function parseApiResponse<Schema extends z.ZodType>(
  response: Response,
  schema: Schema,
): Promise<z.output<Schema>> {
  await throwIfHttpError(response);

  let data: unknown;

  try {
    data = await response.json();
  } catch (cause) {
    if (isAbortError(cause)) {
      throw cause;
    }

    throw new ApiError(
      {
        errorType: 'response',
        reason: 'json',
      },
      cause,
    );
  }

  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ApiError(
      {
        errorType: 'response',
        reason: 'schema',
      },
      result.error,
    );
  }

  return result.data;
}
