import { useMemo } from 'react';
import type { Coordinates } from '../../../../shared/types/coordinates';
import { useQueryParams } from '../../../../shared/hooks/useQueryParams';
import { parseCoordinates } from '../../../../shared/utils/parseCoordinates';

/** URL에서 목적지 좌표를 추출하여 복원하는 훅 */
export const useSearchLocationQuery = (): Coordinates | null => {
  const query = useQueryParams();

  return useMemo(() => parseCoordinates(query.get('lat'), query.get('lng')), [query]);
};
