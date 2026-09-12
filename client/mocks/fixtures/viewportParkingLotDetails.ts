import type { ViewportParkingLotDetailResponse } from '../../api/contracts';

export const viewportParkingLotDetailFixtures: Record<number, ViewportParkingLotDetailResponse> = {
  101: {
    id: 101,
    name: '역삼문화공원 제1호 공영주차장',
    address: '서울 강남구 테헤란로7길 21',
    capacity: 42,
    feeRule: {
      baseFreeMinutes: 0,
      baseMinutes: 30,
      baseFee: 3000,
      additionalMinutes: 10,
      additionalFee: 1000,
      dailyMaxFee: 30000,
    },
    dailyOperations: [
      {
        day: 'WEEKDAY',
        status: 'OPEN',
        openTime: '00:00',
        closeTime: '00:00',
        paid: true,
      },
      {
        day: 'SATURDAY',
        status: 'OPEN',
        openTime: '09:00',
        closeTime: '18:00',
        paid: false,
      },
      {
        day: 'HOLIDAY',
        status: 'CLOSED',
        openTime: null,
        closeTime: null,
        paid: null,
      },
    ],
  },
  105: {
    id: 105,
    name: '운영정보 확인 주차장',
    address: '서울 강남구 역삼동',
    capacity: null,
    feeRule: null,
    dailyOperations: [
      {
        day: 'WEEKDAY',
        status: 'UNKNOWN',
        openTime: null,
        closeTime: null,
        paid: null,
      },
      {
        day: 'SATURDAY',
        status: 'UNKNOWN',
        openTime: null,
        closeTime: null,
        paid: null,
      },
      {
        day: 'HOLIDAY',
        status: 'UNKNOWN',
        openTime: null,
        closeTime: null,
        paid: null,
      },
    ],
  },
};
