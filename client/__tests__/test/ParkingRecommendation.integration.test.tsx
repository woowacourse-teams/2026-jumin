import { jest } from '@jest/globals';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';

import type { ParkingDetailCondition } from '../../shared/types/navigation';
import { ParkingRecommendPage } from '../../src/pages/ParkingRecommendPage/ParkingRecommendPage';
import { renderWithProviders } from '../renderWithProviders';
import { searchCondition, setMockScenario } from '../testData';

const ParkingDetailProbe = () => {
  const { state } = useLocation();
  const detailCondition = (state as { detailCondition?: ParkingDetailCondition } | null)
    ?.detailCondition;

  return <h1>주차장 상세: {detailCondition?.parkingLotName}</h1>;
};

const renderRecommendationPage = () =>
  renderWithProviders(
    <Routes>
      <Route path="/parkingRecommend" element={<ParkingRecommendPage />} />
      <Route path="/parkingDetail" element={<ParkingDetailProbe />} />
    </Routes>,
    {
      initialEntries: [
        {
          pathname: '/parkingRecommend',
          state: { searchCondition },
        },
      ],
    },
  );

const getParkingLotNames = (section: HTMLElement) =>
  within(section)
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);

describe('C. 추천 주차장', () => {
  it('추천 주차장을 거리순으로 확인할 수 있다', async () => {
    renderRecommendationPage();

    const recommendation = await screen.findByRole('region', {
      name: '거리순 추천 주차장',
    });

    expect(getParkingLotNames(recommendation)).toEqual([
      '청운 주차장',
      '역삼문화공원 제1호 공영주차장',
      '강남대로 공영주차장',
    ]);
  });

  it('정렬 기준을 변경하면 추천 순서가 변경된다', async () => {
    renderRecommendationPage();
    const user = userEvent.setup();

    await screen.findByRole('region', { name: '거리순 추천 주차장' });
    await user.click(screen.getByRole('tab', { name: '가격순' }));

    const priceRecommendation = screen.getByRole('region', { name: '가격순 추천 주차장' });
    expect(getParkingLotNames(priceRecommendation)).toEqual([
      '역삼문화공원 제1호 공영주차장',
      '강남대로 공영주차장',
      '청운 주차장',
    ]);
  });

  it('추천할 주차장이 없으면 빈 상태를 표시한다', async () => {
    setMockScenario('parking-empty');
    renderRecommendationPage();

    expect(await screen.findByText('추천할 수 있는 주차장이 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('조회된 주차장이 없습니다.')).toBeInTheDocument();
  });

  it('추천 조회 실패 후 다시 시도하면 목록을 표시한다', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setMockScenario('parking-server-error');
    renderRecommendationPage();
    const user = userEvent.setup();

    const error = await screen.findByRole('alert');
    expect(
      within(error).getByRole('heading', { name: '추천 주차장을 불러오지 못했어요' }),
    ).toBeInTheDocument();

    setMockScenario('success');
    await user.click(within(error).getByRole('button', { name: '다시 시도' }));

    const recommendation = await screen.findByRole('region', {
      name: '거리순 추천 주차장',
    });
    expect(
      within(recommendation).getByRole('heading', {
        name: '역삼문화공원 제1호 공영주차장',
      }),
    ).toBeInTheDocument();
  });

  it('상세정보를 선택하면 해당 주차장 상세 화면으로 이동한다', async () => {
    renderRecommendationPage();
    const user = userEvent.setup();

    const recommendation = await screen.findByRole('region', {
      name: '거리순 추천 주차장',
    });
    const parkingLotHeading = within(recommendation).getByRole('heading', {
      name: '역삼문화공원 제1호 공영주차장',
    });
    const parkingLotCard = parkingLotHeading.closest('article');

    expect(parkingLotCard).not.toBeNull();
    await user.click(within(parkingLotCard!).getByRole('button', { name: '상세정보' }));

    expect(
      screen.getByRole('heading', {
        name: '주차장 상세: 역삼문화공원 제1호 공영주차장',
      }),
    ).toBeInTheDocument();
  });
});
