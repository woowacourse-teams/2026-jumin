import { z } from 'zod';

const errorMessageSchema = z.object({
  message: z.string().min(1),
});

export const parseApiResponse = async <Schema extends z.ZodType>(
  response: Response,
  schema: Schema,
  fallbackMessage: string,
): Promise<z.output<Schema>> => {
  let data: unknown;

  try {
    data = await response.json();
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause;
    }

    // 빈 응답 또는 JSON이 아닌 응답
    throw new Error(fallbackMessage, { cause });
  }

  if (!response.ok) {
    const errorResult = errorMessageSchema.safeParse(data);

    // 서버가 전달한 에러 메시지를 보존
    if (errorResult.success) {
      throw new Error(errorResult.data.message);
    }

    // 에러 응답 형식도 예상과 다른 경우
    throw new Error(fallbackMessage, {
      cause: errorResult.error,
    });
  }

  const result = schema.safeParse(data);

  if (!result.success) {
    // 사용자에게는 기본 문구를 보여주고,
    // Sentry에는 cause로 ZodError를 전달
    throw new Error(fallbackMessage, {
      cause: result.error,
    });
  }

  return result.data;
};
