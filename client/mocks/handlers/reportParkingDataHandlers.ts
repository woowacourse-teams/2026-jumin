import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';

import { getMockScenario } from '../scenario';
import type { ValidationErrorResponse } from '../types/validationError';

const reportRequestSchema = z.object({
  parkingLotId: z.number().int().positive().refine(Number.isSafeInteger),
  detail: z
    .string()
    .max(400, '신고 내용은 400자 이내로 입력해주세요.')
    .refine((detail) => detail.trim().length > 0, '신고 내용을 입력해주세요.'),
});

export const reportParkingDataHandlers = [
  http.post('/api/parking/review', async ({ request }) => {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return HttpResponse.json<ValidationErrorResponse>(
        { message: '요청 본문이 올바른 JSON이 아닙니다.', errors: [] },
        { status: 400 },
      );
    }

    const result = reportRequestSchema.safeParse(body);

    if (!result.success) {
      return HttpResponse.json<ValidationErrorResponse>(
        {
          message: '신고 내용을 확인해주세요.',
          errors: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const scenario = getMockScenario();

    if (scenario === 'parking-report-network-error') {
      return HttpResponse.error();
    }

    await delay(scenario === 'parking-report-slow' ? 2000 : 400);

    if (scenario === 'parking-report-server-error') {
      return HttpResponse.json(
        { message: '신고 접수에 실패했어요. 잠시 후 다시 시도해주세요.' },
        { status: 500 },
      );
    }

    // 성공 상태 코드는 미정이므로 임시로 200과 빈 본문을 사용한다.
    return new HttpResponse(null, { status: 200 });
  }),
];
