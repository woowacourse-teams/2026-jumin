import { Navigate, useLocation } from 'react-router';

import type { ParkingSearchResponse } from '../../../api/contracts';

interface ParkingRecommendationLocationState {
  searchResult: ParkingSearchResponse;
}

export function ParkingRecommendationPage() {
  const location = useLocation();

  const state = location.state as ParkingRecommendationLocationState | null;

  if (state === null) {
    return <Navigate to="/parkingTimeSheet" replace />;
  }

  const { searchResult } = state;

  return (
    <main>
      <h1>주차장 추천 결과</h1>

      <p>검색 결과: {searchResult.totalCount}개</p>

      {searchResult.parkingLots.map((parkingLot) => (
        <article key={parkingLot.id}>
          <h2>{parkingLot.name}</h2>
          <p>{parkingLot.address}</p>
          <p>거리: {parkingLot.distanceMeters}m</p>
          <p>
            예상 요금:{' '}
            {parkingLot.estimatedFee === null ? '정보 없음' : `${parkingLot.estimatedFee.toLocaleString()}원`}
          </p>
        </article>
      ))}
    </main>
  );
}
