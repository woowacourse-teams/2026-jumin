import { z } from 'zod';

/**
 * 공통 스키마
 */

export const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

export const availabilityStatusSchema = z.enum(['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN']);

export const feeCalculationStatusSchema = z.enum(['CALCULATED', 'UNAVAILABLE']);

export const parkingOperationStatusSchema = z.enum(['OPEN', 'CLOSED', 'UNKNOWN']);

export const dailyOperationsDaySchema = z.enum(['WEEKDAY', 'SATURDAY', 'HOLIDAY']);

export const parkingFeeRuleSchema = z.object({
  baseFreeMinutes: z.number().nullable(),
  baseMinutes: z.number().nullable(),
  baseFee: z.number().nullable(),
  additionalMinutes: z.number().nullable(),
  additionalFee: z.number().nullable(),
  dailyMaxFee: z.number().nullable(),
});

/**
 * 목적지
 */
export const destinationSchema = z.object({
  destinationId: z.string(),
  name: z.string(),
  address: z.string(),
  roadAddress: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  provider: z.literal('NAVER'),
});

/**
 * 1. 목적지 검색 후보 응답
 */
export const destinationSearchSchema = z.object({
  query: z.string(),
  destinations: z.array(destinationSchema),
});

/**
 * 2. 목적지 재설정 응답
 */
export const destinationNameSchema = z.object({
  displayName: z.string(),
});

/**
 * 3. 목적지 근처 주차장 응답
 */
export const parkingLotSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  address: z.string(),
  location: locationSchema,
  distanceMeters: z.number().nullable(),
  walkingDurationMinutes: z.number().nullable(),
  estimatedFee: z.number().nullable(),
  balancedScore: z.number().nullable(),
  availabilityStatus: availabilityStatusSchema,
});

export const parkingSearchSchema = z.object({
  searchRadiusMeters: z.literal(600),
  totalCount: z.number(),
  parkingLots: z.array(parkingLotSummarySchema),
});

/**
 * 4. 목적지 근처 주차장 상세정보 응답
 */
export const parkingOperationPeriodSchema = z.object({
  status: parkingOperationStatusSchema,
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
  paid: z.boolean().nullable(),
});

export const parkingOperationSchema = z.object({
  availabilityStatus: availabilityStatusSchema,
  weekday: parkingOperationPeriodSchema,
  weekend: parkingOperationPeriodSchema,
  holiday: parkingOperationPeriodSchema,
});

export const parkingInformationSourceSchema = z.object({
  name: z.string(),
  url: z.string().nullable(),
  lastCheckedAt: z.string(),
});

export const parkingLotDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  address: z.string(),
  location: locationSchema,
  capacity: z.number().nullable(),
  distanceMeters: z.number().nullable(),
  walkingDurationMinutes: z.number().nullable(),
  estimatedFee: z.number().nullable(),
  feeCalculationStatus: feeCalculationStatusSchema,
  feeRule: parkingFeeRuleSchema.nullable(),
  operation: parkingOperationSchema,

  source: parkingInformationSourceSchema.optional(),
});

/**
 * 5. 뷰포트 내 주차장 응답
 */
export const parkingLotViewportSchema = z.object({
  id: z.number(),
  latitude: z.number(),
  longitude: z.number(),
});

export const parkingLotViewportResponseSchema = z.object({
  totalCount: z.number(),
  parkingLots: z.array(parkingLotViewportSchema),
});

/**
 * 6. 뷰포트 내 주차장 상세정보 응답
 */
export const dailyOperationSchema = z.object({
  status: parkingOperationStatusSchema,
  day: dailyOperationsDaySchema,
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
  paid: z.boolean().nullable(),
});

export const viewportParkingLotDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  address: z.string(),
  capacity: z.number().nullable(),
  feeRule: parkingFeeRuleSchema.nullable(),
  dailyOperations: z.array(dailyOperationSchema),
});

/** 최근 주차장 */
export const recentSearchesSchema = z.array(destinationSchema);
