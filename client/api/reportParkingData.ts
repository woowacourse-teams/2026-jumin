import { z } from 'zod';

const errorMessageSchema = z.object({
  message: z.string().min(1),
});

export const submitParkingReport = async (
  parkingLotId: number,
  detail: string,
  signal?: AbortSignal,
): Promise<void> => {
  const response = await fetch('/api/parking/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parkingLotId, detail }),
    signal,
  });

  // 성공 응답에는 본문이 없으므로 JSON으로 읽지 않는다.
  if (response.ok) return;

  const fallbackMessage = '신고 접수에 실패했어요. 잠시 후 다시 시도해주세요.';
  let data: unknown;

  try {
    data = await response.json();
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause;
    }

    throw new Error(fallbackMessage, { cause });
  }

  const result = errorMessageSchema.safeParse(data);

  if (!result.success) {
    throw new Error(fallbackMessage, { cause: result.error });
  }

  throw new Error(result.data.message);
};
