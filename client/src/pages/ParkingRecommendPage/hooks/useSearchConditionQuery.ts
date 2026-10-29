import { useMemo } from 'react';
import { useQueryParams } from '../../../../shared/hooks/useQueryParams';
import type { ParkingSearchCondition } from '../../../../shared/types/navigation';
import { parseCoordinates } from '../../../../shared/utils/parseCoordinates';

export const useSearchConditionQuery = (): ParkingSearchCondition | null => {
  const params = useQueryParams();

  return useMemo(() => {
    const coordinates = parseCoordinates(params.get('lat'), params.get('lng'));
    const name = params.get('name')?.trim();
    const entryAt = params.get('entryAt')?.trim();
    const exitAt = params.get('exitAt')?.trim();

    if (!coordinates || !name || !entryAt || !exitAt) {
      return null;
    }

    const entryTime = Date.parse(entryAt);
    const exitTime = Date.parse(exitAt);

    if (!Number.isFinite(entryTime) || !Number.isFinite(exitTime) || entryTime >= exitTime) {
      return null;
    }

    return {
      destinationName: name,
      destinationLatitude: coordinates.latitude,
      destinationLongitude: coordinates.longitude,
      entryAt,
      exitAt,
    };
  }, [params]);
};
