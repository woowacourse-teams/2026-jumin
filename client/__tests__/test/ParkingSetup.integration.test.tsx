import { jest } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';

import type { ParkingSearchCondition } from '../../shared/types/navigation';
import { ParkingSetupPage } from '../../src/pages/ParkingSetupPage/ParkingSetupPage';
import { ParkingSetupContent } from '../../src/pages/ParkingSetupPage/components/ParkingSetupContent';
import { renderWithProviders } from '../renderWithProviders';
import { destination } from '../testData';

const renderParkingSetup = () => {
  const onRecommend = jest.fn<(condition: ParkingSearchCondition) => void>();

  renderWithProviders(
    <ParkingSetupContent
      map={null}
      destination={destination}
      onSearch={jest.fn()}
      onRecommend={onRecommend}
    />,
  );

  return onRecommend;
};

const moveToTimeStep = async () => {
  const user = userEvent.setup();

  await user.click(screen.getByRole('button', { name: '다음' }));

  return user;
};

const RecommendationProbe = () => {
  const { state } = useLocation();
  const searchCondition = (state as { searchCondition?: ParkingSearchCondition } | null)
    ?.searchCondition;

  return <h1>추천 화면: {searchCondition?.destinationName}</h1>;
};

const renderParkingSetupPage = () =>
  renderWithProviders(
    <Routes>
      <Route path="/parkingsetup" element={<ParkingSetupPage />} />
      <Route path="/parkingRecommend" element={<RecommendationProbe />} />
    </Routes>,
    {
      initialEntries: [
        {
          pathname: '/parkingsetup',
          state: { destination },
        },
      ],
    },
  );

describe('B. 주차 조건 설정', () => {
  it('목적지를 확인하면 시간 설정 단계로 이동한다', async () => {
    renderParkingSetup();

    await moveToTimeStep();

    expect(screen.getByRole('heading', { name: '언제 주차하세요?' })).toBeInTheDocument();
  });

  it('출차 시간이 없으면 추천을 요청할 수 없다', async () => {
    const onRecommend = renderParkingSetup();

    await moveToTimeStep();
    const recommendButton = screen.getByRole('button', { name: '추천 받기' });

    expect(recommendButton).toBeDisabled();
    expect(onRecommend).not.toHaveBeenCalled();
  });

  it('유효한 시간을 설정하면 추천 화면으로 이동한다', async () => {
    renderParkingSetupPage();
    const user = await moveToTimeStep();

    await user.click(screen.getByRole('button', { name: '+1시간' }));
    await user.click(screen.getByRole('button', { name: '추천 받기' }));

    expect(
      screen.getByRole('heading', { name: `추천 화면: ${destination.name}` }),
    ).toBeInTheDocument();
  });
});
