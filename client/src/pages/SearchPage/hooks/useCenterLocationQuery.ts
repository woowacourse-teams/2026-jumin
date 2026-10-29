import { useMemo } from 'react';
import { useQueryParams } from '../../../../shared/hooks/useQueryParams';
import type { Coordinates } from '../../../../shared/types/coordinates';

/** URL에서 뷰포트 중심 좌표를 추출하여 복원하는 훅 */
export const useCenterLocationQuery = (): Coordinates | null => {
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
