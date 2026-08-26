import type { ParkingSearchResponse } from '../../api/contracts';

export const parkingSearchSuccess: ParkingSearchResponse = {
  searchRadiusMeters: 600,
  totalCount: 5,
  parkingLots: [
    {
      id: 101,
      name: '역삼문화공원 제1호 공영주차장',
      address: '서울 강남구 테헤란로7길 21',
      location: {
        latitude: 37.499,
        longitude: 127.029,
      },
      distanceMeters: 310,
      estimatedFee: 6000,
      balancedScore: 0.6421,
      availabilityStatus: 'AVAILABLE',
    },
    {
      id: 102,
      name: '청운 주차장',
      address: '서울 강남구 역삼동 825-9',
      location: {
        latitude: 37.4976,
        longitude: 127.0268,
      },
      distanceMeters: 210,
      estimatedFee: 7500,
      balancedScore: 0.6875,
      availabilityStatus: 'AVAILABLE',
    },
    {
      id: 103,
      name: '강남대로 공영주차장',
      address: '서울 강남구 강남대로 438',
      location: {
        latitude: 37.501,
        longitude: 127.0265,
      },
      distanceMeters: 360,
      estimatedFee: 7000,
      balancedScore: 0.675,
      availabilityStatus: 'AVAILABLE',
    },
    {
      id: 104,
      name: '도곡로21길 공영주차장',
      address: '서울 강남구 도곡로21길 7',
      location: {
        latitude: 37.4942,
        longitude: 127.0331,
      },
      distanceMeters: 540,
      estimatedFee: 5000,
      balancedScore: null,
      availabilityStatus: 'UNAVAILABLE',
    },
    {
      id: 105,
      name: '운영정보 확인 주차장',
      address: '서울 강남구 역삼동',
      location: {
        latitude: 37.4978,
        longitude: 127.0269,
      },
      distanceMeters: 420,
      estimatedFee: null,
      balancedScore: null,
      availabilityStatus: 'UNKNOWN',
    },
  ],
};

export const parkingSearchEmpty: ParkingSearchResponse = {
  searchRadiusMeters: 600,
  totalCount: 0,
  parkingLots: [],
};
