import { jest } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';

import { ParkingDetailPage } from '../../src/pages/ParkingDetailPage/ParkingDetailPage';
import type { RecentParkingUse } from '../../shared/utils/recentParkingUses';
import { renderWithProviders } from '../renderWithProviders';
import {
  createDetailCondition,
  mockGeolocation,
  recommendedParkingLot,
  setMockScenario,
} from '../testData';

const renderDetailPage = (parkingLotId = 101) =>
  renderWithProviders(
    <Routes>
      <Route path="/parkingDetail" element={<ParkingDetailPage />} />
    </Routes>,
    {
      initialEntries: [
        {
          pathname: '/parkingDetail',
          state: { detailCondition: createDetailCondition(parkingLotId) },
        },
      ],
    },
  );

const openDirectionsModal = async () => {
  const user = userEvent.setup();

  await user.click(await screen.findByRole('button', { name: '길찾기 시작' }));

  return { user, dialog: screen.getByRole('dialog', { name: '길찾기 앱 선택' }) };
};

describe('D. 주차장 상세정보', () => {
  it('예상 요금, 거리, 운영시간과 출처를 확인할 수 있다', async () => {
    renderDetailPage();

    expect(await screen.findByText('6,000원')).toBeInTheDocument();
    expect(screen.getByText('직선거리 310m')).toBeInTheDocument();
    expect(screen.getByText('평일 24시간')).toBeInTheDocument();
    expect(screen.getByText('서울 열린데이터광장 · 2026.8.21 기준')).toBeInTheDocument();
  });

  it('제공되지 않은 정보는 미제공으로 표시한다', async () => {
    renderDetailPage(105);

    const missingInformation = await screen.findAllByText('미제공');

    expect(missingInformation.length).toBeGreaterThanOrEqual(3);
  });

  it('상세 조회 실패 후 다시 시도하면 정보를 표시한다', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setMockScenario('parking-detail-server-error');
    renderDetailPage();
    const user = userEvent.setup();

    const error = await screen.findByRole('alert');
    expect(
      within(error).getByRole('heading', { name: '주차장 상세정보를 불러오지 못했어요' }),
    ).toBeInTheDocument();

    setMockScenario('success');
    await user.click(within(error).getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('직선거리 310m')).toBeInTheDocument();
  });

  it('길찾기 모달을 열고 지도 앱을 선택할 수 있다', async () => {
    const getCurrentPosition = mockGeolocation();
    renderDetailPage();

    const { dialog } = await openDirectionsModal();
    const naverMapButton = within(dialog).getByRole('button', { name: /네이버 지도/ });

    expect(
      within(dialog).getByRole('heading', { name: '어떤 앱으로 갈까요?' }),
    ).toBeInTheDocument();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(naverMapButton).toBeEnabled());
  });

  it('길찾기를 시작한 주차장이 최근 이용에 저장된다', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGeolocation();
    renderDetailPage();

    const { user, dialog } = await openDirectionsModal();
    const naverMapButton = within(dialog).getByRole('button', { name: /네이버 지도/ });
    await waitFor(() => expect(naverMapButton).toBeEnabled());
    await user.click(naverMapButton);

    const recentParkingUses = JSON.parse(
      localStorage.getItem('recentParkingUses') ?? '[]',
    ) as RecentParkingUse[];

    expect(recentParkingUses).toHaveLength(1);
    expect(recentParkingUses[0]?.parkingLot).toEqual(
      expect.objectContaining({
        id: recommendedParkingLot.id,
        name: recommendedParkingLot.name,
        address: recommendedParkingLot.address,
        location: recommendedParkingLot.location,
      }),
    );
  });
});
