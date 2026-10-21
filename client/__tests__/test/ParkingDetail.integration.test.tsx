import { jest } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';

import { API_ERROR_MESSAGES } from '../../api/apiErrorMessages';
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
  it('상세 화면에서 좋아요한 상태를 같은 익명 ID로 다시 조회할 수 있다', async () => {
    const { unmount, queryClient } = renderDetailPage();
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: '좋아요 12개' });
    const guestId = localStorage.getItem('guestId');

    await user.click(button);
    await waitFor(() =>
      expect(queryClient.getQueryData(['parking-lots', 'viewport-detail', 101])).toEqual(
        expect.objectContaining({ likeCount: 13, likedByMe: true }),
      ),
    );
    expect(button).toHaveAccessibleName('좋아요 13개');
    expect(button).toHaveAttribute('aria-pressed', 'true');

    unmount();
    renderDetailPage();
    expect(await screen.findByRole('button', { name: '좋아요 13개' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(localStorage.getItem('guestId')).toBe(guestId);
  });

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

  it('하단 제보 버튼에서 신고 모달을 열고 닫을 수 있다', async () => {
    renderDetailPage();
    const user = userEvent.setup();
    const reportButton = await screen.findByRole('button', { name: '제보하기' });
    const actions = screen.getByRole('region', { name: '주차장 빠른 메뉴' });

    expect(actions).not.toContainElement(reportButton);
    expect(actions).toContainElement(screen.getByRole('button', { name: '길찾기 시작' }));
    expect(actions).toContainElement(screen.getByRole('button', { name: '로드뷰 보기' }));

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

  it('출처가 없어도 하단에서 신고 모달을 열 수 있다', async () => {
    server.use(
      http.get('/api/parking/101', () =>
        HttpResponse.json({ ...parkingDetailFixtures[101], source: undefined }),
      ),
    );
    renderDetailPage();
    const user = userEvent.setup();
    const reportButton = await screen.findByRole('button', { name: '제보하기' });
    const actions = screen.getByRole('region', { name: '주차장 빠른 메뉴' });

    expect(screen.queryByText(/서울 열린데이터광장/)).not.toBeInTheDocument();
    expect(actions).not.toContainElement(reportButton);

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
      within(error).getByRole('heading', { name: API_ERROR_MESSAGES.parkingDetail }),
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

  it('로드뷰 버튼을 누르면 전체 화면 로드뷰를 열고 닫을 수 있다', async () => {
    renderDetailPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '로드뷰 보기' }));

    expect(
      screen.getByRole('dialog', { name: '역삼문화공원 제1호 공영주차장 로드뷰' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '로드뷰 닫기' }));

    expect(screen.queryByRole('dialog', { name: /로드뷰$/ })).not.toBeInTheDocument();
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
