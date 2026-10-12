import { z } from 'zod';

import { parseApiResponse } from '../../../api/parseApiResponse';

export const adminLoginResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresInSeconds: z.number().int().positive(),
});

export const parkingCsvSummaryResponseSchema = z.object({
  addedCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  reactivatedCount: z.number().int().nonnegative(),
  deactivatedCount: z.number().int().nonnegative(),
  unchangedCount: z.number().int().nonnegative(),
});

export const parkingCsvImportResponseSchema = z.object({
  fileName: z.string().min(1),
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/),
  csvRowCount: z.number().int().positive(),
  summary: parkingCsvSummaryResponseSchema,
});

export const parkingReviewsResponseSchema = z.object({
  reviews: z.array(
    z.object({
      reviewId: z.number().int().positive(),
      parkingLotId: z.number().int().positive(),
      parkingLotName: z.string(),
      parkingLotAddress: z.string().nullable(),
      detail: z.string().nullable(),
      createdAt: z.iso.datetime({ local: true }).refine((value) => !value.endsWith('Z')),
    }),
  ),
});

export type AdminLoginResponse = z.output<typeof adminLoginResponseSchema>;
export type ParkingCsvSummaryResponse = z.output<typeof parkingCsvSummaryResponseSchema>;
export type ParkingCsvImportResponse = z.output<typeof parkingCsvImportResponseSchema>;
export type ParkingReviewsResponse = z.output<typeof parkingReviewsResponseSchema>;
export type ParkingReview = ParkingReviewsResponse['reviews'][number];

const errorMessageSchema = z.object({
  message: z.string().min(1),
});

const validationErrorsSchema = z.object({
  errors: z.array(
    z.object({
      field: z.string(),
      message: z.string(),
    }),
  ),
});

export type AdminValidationError = z.output<typeof validationErrorsSchema>['errors'][number];

export class AdminApiError extends Error {
  readonly status: number | null;
  readonly errors: AdminValidationError[];

  constructor(message: string, status: number | null, errors: AdminValidationError[] = []) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.errors = errors;
  }
}

const LOGIN_FAILED_MESSAGE = '로그인 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
const UPLOAD_RESULT_UNKNOWN_MESSAGE =
  '업로드 결과를 확인할 수 없습니다. 데이터가 반영되었을 수 있으니 확인 후 다시 업로드해 주세요.';
const REVIEWS_FAILED_MESSAGE = '제보 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';

const getLoginErrorMessage = (status: number): string => {
  switch (status) {
    case 400:
      return '아이디와 비밀번호를 확인해 주세요.';
    case 401:
      return '아이디 또는 비밀번호가 올바르지 않습니다.';
    case 415:
      return '로그인 요청 형식이 올바르지 않습니다.';
    default:
      return LOGIN_FAILED_MESSAGE;
  }
};

const getImportErrorMessage = (status: number): string => {
  if (status >= 500) {
    return UPLOAD_RESULT_UNKNOWN_MESSAGE;
  }

  switch (status) {
    case 400:
      return '업로드할 CSV 파일을 확인해 주세요.';
    case 401:
      return '인증이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.';
    case 409:
      return '다른 업로드가 진행 중이거나 주차장 데이터가 충돌했습니다. 확인 후 다시 시도해 주세요.';
    case 413:
      return 'CSV 파일은 최대 10MiB까지 업로드할 수 있습니다.';
    case 415:
      return 'CSV 확장자와 UTF-8 또는 UTF-8 BOM 인코딩을 확인해 주세요.';
    case 422:
      return 'CSV 파일의 형식이 올바르지 않습니다. 오류 내용을 확인해 주세요.';
    default:
      return 'CSV 업로드 요청을 처리하지 못했습니다.';
  }
};

const readApiError = async (
  response: Response,
  fallbackMessage: string,
  preserveServerMessage = true,
): Promise<AdminApiError> => {
  let data: unknown;

  try {
    data = await response.json();
  } catch {
    return new AdminApiError(fallbackMessage, response.status);
  }

  const messageResult = errorMessageSchema.safeParse(data);
  const errorsResult = validationErrorsSchema.safeParse(data);
  let message = fallbackMessage;
  let errors: AdminValidationError[] = [];

  if (preserveServerMessage && messageResult.success) {
    message = messageResult.data.message;
  }

  if (errorsResult.success) {
    errors = errorsResult.data.errors;
  }

  return new AdminApiError(message, response.status, errors);
};

export const loginAdmin = async (request: {
  loginId: string;
  password: string;
}): Promise<AdminLoginResponse> => {
  let response: Response;

  try {
    response = await fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId: request.loginId.trim(), password: request.password }),
    });
  } catch {
    throw new AdminApiError(LOGIN_FAILED_MESSAGE, null);
  }

  if (!response.ok) {
    throw await readApiError(response, getLoginErrorMessage(response.status));
  }

  try {
    return await parseApiResponse(response, adminLoginResponseSchema, LOGIN_FAILED_MESSAGE);
  } catch {
    throw new AdminApiError(LOGIN_FAILED_MESSAGE, response.status);
  }
};

export const importParkingCsv = async (
  file: File,
  accessToken: string,
): Promise<ParkingCsvImportResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  let response: Response;

  try {
    response = await fetch('/api/admin/parking/csv/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });
  } catch {
    throw new AdminApiError(UPLOAD_RESULT_UNKNOWN_MESSAGE, null);
  }

  if (!response.ok) {
    throw await readApiError(
      response,
      getImportErrorMessage(response.status),
      response.status < 500,
    );
  }

  try {
    return await parseApiResponse(
      response,
      parkingCsvImportResponseSchema,
      UPLOAD_RESULT_UNKNOWN_MESSAGE,
    );
  } catch {
    throw new AdminApiError(UPLOAD_RESULT_UNKNOWN_MESSAGE, response.status);
  }
};

export const getParkingReviews = async (
  accessToken: string,
  signal?: AbortSignal,
): Promise<ParkingReviewsResponse> => {
  let response: Response | undefined;

  try {
    response = await fetch('/api/admin/parking/review', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal,
    });

    if (!response.ok) {
      const message =
        response.status === 401
          ? '인증이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.'
          : REVIEWS_FAILED_MESSAGE;

      throw await readApiError(response, message);
    }

    return await parseApiResponse(response, parkingReviewsResponseSchema, REVIEWS_FAILED_MESSAGE);
  } catch (error) {
    signal?.throwIfAborted();

    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    if (error instanceof AdminApiError) {
      throw error;
    }

    throw new AdminApiError(REVIEWS_FAILED_MESSAGE, response?.status ?? null);
  }
};
