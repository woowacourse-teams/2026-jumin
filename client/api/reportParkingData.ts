import { throwIfHttpError } from './parseApiResponse';
import { request } from './request';

export const submitParkingReport = async (
  parkingLotId: number,
  detail: string,
  signal?: AbortSignal,
): Promise<void> => {
  const response = await request('/api/parking/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parkingLotId, detail }),
    signal,
  });

  await throwIfHttpError(response);
};
