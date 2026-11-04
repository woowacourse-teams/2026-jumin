import z from 'zod';

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

/** 최근 검색한 목적지 목록 */
export const recentSearchesSchema = z.array(destinationSchema);
