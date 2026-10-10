import { jest } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';

import type { ParkingSearchCondition } from '../../shared/types/navigation';
import { ParkingSetupPage } from '../../src/pages/ParkingSetupPage/ParkingSetupPage';
import { ParkingSetupContent } from '../../src/pages/ParkingSetupPage/components/ParkingSetupContent';
import { renderWithProviders } from '../renderWithProviders';
import { TestMapLayout } from '../TestMapLayout';
import { destination } from '../testData';

const renderParkingSetup = () => {
  const onRecommend = jest.fn<(condition: ParkingSearchCondition) => void>();

  renderWithProviders(
    <ParkingSetupContent
      map={null}
      destination={destination}
      onSetupViewChange={jest.fn()}
      onSearch={jest.fn()}
      onRecommend={onRecommend}
    />,
  );

  return onRecommend;
};

const confirmDestination = async () => {
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
      <Route element={<TestMapLayout />}>
        <Route path="/parkingsetup" element={<ParkingSetupPage />} />
        <Route path="/parkingRecommend" element={<RecommendationProbe />} />
      </Route>
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
  it('목적지를 확인하면 선택한 좌표로 바로 추천을 요청한다', async () => {
    const onRecommend = renderParkingSetup();

    await confirmDestination();

    expect(onRecommend).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationName: destination.name,
        destinationLatitude: destination.latitude,
        destinationLongitude: destination.longitude,
      }),
    );
  });

  it('추천 요청에는 10분 단위의 입차 시간과 1시간 뒤 출차 시간을 전달한다', async () => {
    const onRecommend = renderParkingSetup();

    await confirmDestination();

    const condition = onRecommend.mock.calls[0]![0];
    const entryAt = new Date(condition.entryAt);
    const exitAt = new Date(condition.exitAt);

    expect(entryAt.getMinutes() % 10).toBe(0);
    expect(entryAt.getSeconds()).toBe(0);
    expect(entryAt.getMilliseconds()).toBe(0);
    expect(exitAt.getTime() - entryAt.getTime()).toBe(60 * 60 * 1000);
  });

  it('목적지를 확인하면 추천 화면으로 이동한다', async () => {
    renderParkingSetupPage();
    await confirmDestination();

    expect(
      screen.getByRole('heading', { name: `추천 화면: ${destination.name}` }),
    ).toBeInTheDocument();
  });
});
