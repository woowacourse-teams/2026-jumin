import { useMemo } from 'react';
import { useLocation } from 'react-router';

/** URL Search 문자열을 URLSearchParams 객체로 반환하는 범용 훅 */
export const useQueryParams = () => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
};

/** 객체를 URL query 문자열로 변환하는 범용 유틸리티 */
export const buildQueryString = (params: Record<string, string | number | boolean | undefined>) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  });
  return searchParams.toString() ? `?${searchParams.toString()}` : '';
};
