import type { Coordinates } from '../types/coordinates';

/** 외부 입력의 누락·공백·숫자·좌표 범위를 검사한다. */
export const parseCoordinates = (lat: string | null, lng: string | null): Coordinates | null => {
  if (!lat?.trim() || !lng?.trim()) return null;

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

  return { latitude, longitude };
};
