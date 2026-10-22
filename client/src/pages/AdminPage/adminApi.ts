import { z } from 'zod';

import { parseApiResponse } from '../../../api/parseApiResponse';
import { request } from '../../../api/request';

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

export const loginAdmin = async (requestBody: {
  loginId: string;
  password: string;
}): Promise<AdminLoginResponse> => {
  const response = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loginId: requestBody.loginId.trim(),
      password: requestBody.password,
    }),
  });

  return parseApiResponse(response, adminLoginResponseSchema);
};

export const importParkingCsv = async (
  file: File,
  accessToken: string,
): Promise<ParkingCsvImportResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await request('/api/admin/parking/csv/import', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  return parseApiResponse(response, parkingCsvImportResponseSchema);
};

export const getParkingReviews = async (
  accessToken: string,
  signal?: AbortSignal,
): Promise<ParkingReviewsResponse> => {
  const response = await request('/api/admin/parking/review', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal,
  });

  return parseApiResponse(response, parkingReviewsResponseSchema);
};
