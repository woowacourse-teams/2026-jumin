import type { Destination } from '../../api/contracts';

export const destinationFixtures: Destination[] = [
  {
    destinationId: 'naver_12345',
    name: '강남역 11번 출구',
    address: '서울 강남구 역삼동 858',
    roadAddress: '서울 강남구 강남대로 396',
    latitude: 37.4981,
    longitude: 127.0279,
    provider: 'NAVER',
  },
  {
    destinationId: 'naver_12346',
    name: '강남역 신분당선 11번 출구',
    address: '서울 강남구 역삼동 858',
    roadAddress: '서울 강남구 강남대로 396',
    latitude: 37.4979,
    longitude: 127.0276,
    provider: 'NAVER',
  },
  {
    destinationId: 'naver_12347',
    name: '강남구청역',
    address: '서울 강남구 삼성동 111-44',
    roadAddress: '서울 강남구 학동로 지하 346',
    latitude: 37.5172,
    longitude: 127.0413,
    provider: 'NAVER',
  },
  {
    destinationId: 'naver_12348',
    name: '강남세브란스병원',
    address: '서울 강남구 도곡동 146-92',
    roadAddress: '서울 강남구 언주로 211',
    latitude: 37.4928,
    longitude: 127.0462,
    provider: 'NAVER',
  },
];
