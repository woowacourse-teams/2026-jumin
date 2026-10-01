import { jest } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';

import { ParkingDetailPage } from '../../src/pages/ParkingDetailPage/ParkingDetailPage';
import { parkingDetailFixtures } from '../../mocks/fixtures/parkingDetails';
import { server } from '../msw/server';
import type { RecentParkingUse } from '../../shared/utils/recentParkingUses';
import { renderWithProviders } from '../renderWithProviders';
import { TestMapLayout } from '../TestMapLayout';
import {
  createDetailCondition,
  mockGeolocation,
  recommendedParkingLot,
  setMockScenario,
} from '../testData';

const renderDetailPage = (parkingLotId = 101) =>
  renderWithProviders(
    <Routes>
      <Route element={<TestMapLayout />}>
        <Route path="/parkingDetail" element={<ParkingDetailPage />} />
      </Route>
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
  it('예상 요금, 도보 거리와 운영시간을 확인할 수 있다', async () => {
    renderDetailPage();

    expect(await screen.findByText('6,000원')).toBeInTheDocument();
    expect(screen.getByText('도보 거리')).toBeInTheDocument();
    expect(screen.getByText('310m(5분)')).toBeInTheDocument();
    expect(screen.getByText('평일 24시간')).toBeInTheDocument();
  });

  it('제공되지 않은 정보는 미제공으로 표시한다', async () => {
    renderDetailPage(105);

    expect(await screen.findByText('도보 정보 없음')).toBeInTheDocument();

    const missingInformation = await screen.findAllByText('미제공');

    expect(missingInformation.length).toBeGreaterThanOrEqual(3);
  });

  it('오른쪽에 신고 버튼을 배치하고 신고 모달을 열고 닫을 수 있다', async () => {
    renderDetailPage();
    const user = userEvent.setup();
    const reportButton = await screen.findByRole('button', { name: '신고하기' });
    const reportPrompt = screen.getByText('주차장 정보가 다른가요?');

    expect(reportButton.parentElement).toContainElement(reportPrompt);
    expect(reportButton.parentElement?.parentElement).toHaveStyle({
      display: 'flex',
      justifyContent: 'flex-end',
    });
    expect(reportButton).not.toContainElement(reportPrompt);
    await user.click(reportPrompt);
    expect(screen.queryByRole('dialog', { name: '주차장 정보 신고' })).not.toBeInTheDocument();

    await user.click(reportButton);
    const dialog = screen.getByRole('dialog', { name: '주차장 정보 신고' });
    await user.type(
      within(dialog).getByRole('textbox', { name: '신고 내용' }),
      '요금 정보가 달라요.',
    );
    await user.click(within(dialog).getByRole('button', { name: '주차장 정보 신고 닫기' }));

    expect(screen.queryByRole('dialog', { name: '주차장 정보 신고' })).not.toBeInTheDocument();

    await user.click(reportButton);
    expect(screen.getByRole('textbox', { name: '신고 내용' })).toHaveValue('');
  });

  it('출처가 없어도 오른쪽에 신고 버튼을 표시하고 모달을 열 수 있다', async () => {
    server.use(
      http.get('/api/parking/101', () =>
        HttpResponse.json({ ...parkingDetailFixtures[101], source: undefined }),
      ),
    );
    renderDetailPage();
    const user = userEvent.setup();
    const reportButton = await screen.findByRole('button', { name: '신고하기' });
    const reportRow = reportButton.parentElement?.parentElement;

    expect(screen.queryByText(/서울 열린데이터광장/)).not.toBeInTheDocument();
    expect(reportRow).toHaveStyle({ display: 'flex', justifyContent: 'flex-end' });

    await user.click(reportButton);
    expect(screen.getByRole('dialog', { name: '주차장 정보 신고' })).toBeInTheDocument();
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

    expect(await screen.findByText('310m(5분)')).toBeInTheDocument();
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
