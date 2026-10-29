import { useMemo } from 'react';
import { useQueryParams } from '../../../../shared/hooks/useQueryParams';
import type { ParkingSearchCondition } from '../../../../shared/types/navigation';

export const useSearchConditionQuery = (): ParkingSearchCondition | null => {
  const params = useQueryParams();

  return useMemo(() => {
    const lat = params.get('lat')?.trim();
    const lng = params.get('lng')?.trim();
    const name = params.get('name')?.trim();
    const entryAt = params.get('entryAt')?.trim();
    const exitAt = params.get('exitAt')?.trim();

    // 숫자로 변환하기 전에 누락·빈 문자열을 검사한다.
    if (!lat || !lng || !name || !entryAt || !exitAt) {
      return null;
    }

    const latitude = Number(lat);
    const longitude = Number(lng);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }

    const entryTime = Date.parse(entryAt);
    const exitTime = Date.parse(exitAt);

    if (!Number.isFinite(entryTime) || !Number.isFinite(exitTime) || entryTime >= exitTime) {
      return null;
    }

    return {
      destinationName: name,
      destinationLatitude: latitude,
      destinationLongitude: longitude,
      entryAt,
      exitAt,
    };
  }, [params]);
};
