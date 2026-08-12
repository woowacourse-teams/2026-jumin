/** 개발 빌드에서 도메인 규칙이 깨지지 않았는지 확인하는 자체 점검. */

import type { ParkingLotSummary } from './types';
import { buildDirectionsUrl } from './directions';
import { sortParkingLots } from './parkingLot';
import { deriveVisit, initialNearbyVisit } from './visit';

export const runDomainSelfCheck = () => {
  const nearby = deriveVisit(initialNearbyVisit(new Date('2026-08-11T14:01:00Z')));
  if (nearby?.entryAt !== '2026-08-11T23:10:00+09:00' || nearby.exitAt !== '2026-08-12T00:10:00+09:00')
    throw new Error('주변 방문 시각 self-check 실패');
  const lots: ParkingLotSummary[] = [
    {
      parkingLotId: 'b',
      name: 'b',
      address: 'b',
      location: { latitude: 0, longitude: 0 },
      distanceMeters: 2,
      estimatedFee: null,
      feeCalculationStatus: 'UNAVAILABLE',
      operation: { status: 'UNKNOWN' },
      sortRanks: { distance: 2, price: null, balanced: null },
    },
    {
      parkingLotId: 'a',
      name: 'a',
      address: 'a',
      location: { latitude: 0, longitude: 0 },
      distanceMeters: 1,
      estimatedFee: 0,
      feeCalculationStatus: 'CALCULATED',
      operation: { status: 'AVAILABLE' },
      sortRanks: { distance: 1, price: 1, balanced: 1 },
    },
  ];
  if (sortParkingLots(lots, 'PRICE')[0]?.parkingLotId !== 'a') throw new Error('정렬 self-check 실패');
  const target = { ...lots[1]!, name: '강남 역', location: { latitude: 37.5, longitude: 127 } };
  const config = { naverMapAppName: 'com.example.app', tmapAppKey: 'key' };
  const naver = buildDirectionsUrl('NAVER', target, config);
  const kakao = buildDirectionsUrl('KAKAO', target, config);
  const tmap = buildDirectionsUrl('TMAP', target, config);
  if (
    !naver?.startsWith('nmap://route/car?') ||
    new URL(naver).searchParams.get('dlat') !== '37.5' ||
    new URL(naver).searchParams.get('dlng') !== '127' ||
    kakao !== 'kakaomap://route?ep=37.5,127&by=car' ||
    !tmap ||
    new URL(tmap).searchParams.get('goalx') !== '127' ||
    new URL(tmap).searchParams.get('goaly') !== '37.5'
  )
    throw new Error('길찾기 self-check 실패');
};
