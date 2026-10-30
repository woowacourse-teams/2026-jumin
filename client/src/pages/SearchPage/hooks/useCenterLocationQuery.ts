import { useMemo } from 'react';
import { useQueryParams } from '../../../../shared/hooks/useQueryParams';
import type { Coordinates } from '../../../../shared/types/coordinates';
import { parseCoordinates } from '../../../../shared/utils/parseCoordinates';

/** URL에서 뷰포트 중심 좌표를 추출하여 복원하는 훅 */
export const useCenterLocationQuery = (): Coordinates | null => {
  const query = useQueryParams();

  return useMemo(() => parseCoordinates(query.get('lat'), query.get('lng')), [query]);
};
