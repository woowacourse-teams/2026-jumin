import { z } from 'zod';

import { ApiError, type FieldError } from './apiError';
import { isAbortError } from './isAbortError';

const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});

const apiErrorResponseSchema = z.object({
  message: z.string().optional(),
  code: z.string().optional(),
  errors: z.array(fieldErrorSchema).optional(),
});

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

  const result = apiErrorResponseSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError(
      {
        errorType: 'http',
        status: response.status,
        fieldErrors: [],
      },
      result.error,
    );
  }

  const fieldErrors: FieldError[] = result.data.errors ?? [];

  throw new ApiError({
    errorType: 'http',
    status: response.status,
    serverMessage: result.data.message,
    serverCode: result.data.code,
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
