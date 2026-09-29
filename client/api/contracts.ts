import z from 'zod';
import {
  availabilityStatusSchema,
  dailyOperationsDaySchema,
  destinationNameSchema,
  destinationSchema,
  destinationSearchSchema,
  feeCalculationStatusSchema,
  parkingFeeRuleSchema,
  parkingInformationSourceSchema,
  parkingLotDetailSchema,
  parkingLotSummarySchema,
  parkingLotViewportResponseSchema,
  parkingLotViewportSchema,
  parkingOperationPeriodSchema,
  parkingOperationSchema,
  parkingOperationStatusSchema,
  parkingSearchSchema,
  viewportParkingLotDetailSchema,
} from './parkingLotsSchema';

// 공통 타입
export type AvailabilityStatus = z.infer<typeof availabilityStatusSchema>;
export type FeeCalculationStatus = z.infer<typeof feeCalculationStatusSchema>;
export type ParkingOperationStatus = z.infer<typeof parkingOperationStatusSchema>;
export type DailyOperationsDay = z.infer<typeof dailyOperationsDaySchema>;
export type ParkingFeeRule = z.infer<typeof parkingFeeRuleSchema>;

// 목적지
export type Destination = z.infer<typeof destinationSchema>;

// 1. 목적지 검색 후보 응답
export type DestinationSearchResponse = z.infer<typeof destinationSearchSchema>;

// 2. 목적지 재설정 응답
export type DestinationNameResponse = z.infer<typeof destinationNameSchema>;

// 3. 목적지 근처 주차장 응답
export type ParkingLotSummary = z.infer<typeof parkingLotSummarySchema>;
export type ParkingSearchResponse = z.infer<typeof parkingSearchSchema>;

// 4. 목적지 근처 주차장 상세정보 응답
export type ParkingOperationPeriod = z.infer<typeof parkingOperationPeriodSchema>;
export type ParkingOperation = z.infer<typeof parkingOperationSchema>;
export type ParkingInformationSource = z.infer<typeof parkingInformationSourceSchema>;
export type ParkingLotDetailResponse = z.infer<typeof parkingLotDetailSchema>;

// 5. 뷰포트 내 주차장 응답
export type ParkingLotViewport = z.infer<typeof parkingLotViewportSchema>;
export type ParkingLotViewportResponse = z.infer<typeof parkingLotViewportResponseSchema>;

// 6. 뷰포트 내 주차장 상세정보 응답
export type ViewportParkingLotDetailResponse = z.infer<typeof viewportParkingLotDetailSchema>;
