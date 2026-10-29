import { useMemo } from 'react';
import type { Coordinates } from '../types/destination';
import { useQueryParams } from '../../../../shared/hooks/useQueryParams';

/** URL에서 목적지 좌표를 추출하여 복원하는 훅 */
export const useRestoreLocation = (): Coordinates | null => {
  const query = useQueryParams();

  return useMemo(() => {
    const lat = query.get('lat');
    const lng = query.get('lng');

    if (lat && lng && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
      return {
        latitude: Number(lat),
        longitude: Number(lng),
      };
    }

    return null; // Query에 좌표가 없거나 유효하지 않으면 null 반환
  }, [query]);
};
