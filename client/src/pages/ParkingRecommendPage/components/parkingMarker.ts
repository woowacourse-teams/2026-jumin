export type ParkingMarkerType = 'selected' | 'recommended' | 'candidate';

export const getParkingMarkerType = (
  parkingLotId: number,
  selectedParkingLotId: number | null,
  recommendedParkingLotIds: number[],
): ParkingMarkerType => {
  if (parkingLotId === selectedParkingLotId) return 'selected';
  if (recommendedParkingLotIds.includes(parkingLotId)) return 'recommended';

  return 'candidate';
};
