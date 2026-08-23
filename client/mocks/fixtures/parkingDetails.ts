import type {
  ParkingFeeRule,
  ParkingInformationSource,
  ParkingLotDetailResponse,
  ParkingOperation,
} from '../../api/contracts';
import { parkingSearchSuccess } from './parkingSearch';

const source: ParkingInformationSource = {
  name: '서울 열린데이터광장',
  url: 'https://data.seoul.go.kr',
  lastCheckedAt: '2026-08-21T12:00:00+09:00',
};

const standardFeeRule: ParkingFeeRule = {
  baseFreeMinutes: 0,
  baseMinutes: 30,
  baseFee: 3000,
  additionalMinutes: 10,
  additionalFee: 1000,
  dailyMaxFee: 30000,
  monthlyFee: 150000,
};

const allDayOperation: ParkingOperation = {
  availabilityStatus: 'AVAILABLE',
  weekday: {
    status: 'OPEN',
    openTime: '00:00',
    closeTime: '00:00',
    paid: true,
  },
  weekend: {
    status: 'OPEN',
    openTime: '09:00',
    closeTime: '18:00',
    paid: null,
  },
  holiday: {
    status: 'CLOSED',
    openTime: null,
    closeTime: null,
    paid: null,
  },
};

const getSearchParkingLot = (id: number) => {
  const parkingLot = parkingSearchSuccess.parkingLots.find((candidate) => candidate.id === id);

  if (!parkingLot) throw new Error(`상세 fixture에 대응하는 검색 주차장이 없습니다: ${id}`);

  return parkingLot;
};

const createDetailBase = (id: number) => {
  const { name, address, location, distanceMeters, estimatedFee } = getSearchParkingLot(id);

  return { id, name, address, location, distanceMeters, estimatedFee };
};

export const parkingDetailFixtures: Record<number, ParkingLotDetailResponse> = {
  1: {
    ...createDetailBase(101),
    id: 1,
    capacity: 42,
    feeCalculationStatus: 'CALCULATED',
    feeRule: standardFeeRule,
    operation: allDayOperation,
    source,
  },
  101: {
    ...createDetailBase(101),
    capacity: 42,
    feeCalculationStatus: 'CALCULATED',
    feeRule: standardFeeRule,
    operation: allDayOperation,
    source,
  },
  102: {
    ...createDetailBase(102),
    capacity: 28,
    feeCalculationStatus: 'CALCULATED',
    feeRule: {
      ...standardFeeRule,
      baseFee: 3500,
      additionalFee: 800,
      monthlyFee: null,
    },
    operation: {
      ...allDayOperation,
      weekend: {
        status: 'OPEN',
        openTime: '09:00',
        closeTime: '18:00',
        paid: null,
      },
    },
    source,
  },
  103: {
    ...createDetailBase(103),
    capacity: null,
    feeCalculationStatus: 'CALCULATED',
    feeRule: {
      ...standardFeeRule,
      baseFreeMinutes: 10,
      dailyMaxFee: 25000,
      monthlyFee: 120000,
    },
    operation: allDayOperation,
    source,
  },
  104: {
    ...createDetailBase(104),
    capacity: 16,
    feeCalculationStatus: 'CALCULATED',
    feeRule: standardFeeRule,
    operation: {
      ...allDayOperation,
      availabilityStatus: 'UNAVAILABLE',
      weekday: {
        status: 'OPEN',
        openTime: '09:00',
        closeTime: '18:00',
        paid: true,
      },
    },
    source,
  },
  105: {
    ...createDetailBase(105),
    capacity: null,
    feeCalculationStatus: 'UNAVAILABLE',
    feeRule: null,
    operation: {
      availabilityStatus: 'UNKNOWN',
      weekday: {
        status: 'UNKNOWN',
        openTime: null,
        closeTime: null,
        paid: null,
      },
      weekend: {
        status: 'UNKNOWN',
        openTime: null,
        closeTime: null,
        paid: null,
      },
      holiday: {
        status: 'UNKNOWN',
        openTime: null,
        closeTime: null,
        paid: null,
      },
    },
    source,
  },
};
