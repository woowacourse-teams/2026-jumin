import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';

import type { Destination } from '../../api/contracts';
import { SearchPage } from '../../src/pages/SearchPage/SearchPage';
import { renderWithProviders } from '../renderWithProviders';
import { destination, setMockScenario } from '../testData';

const ParkingSetupProbe = () => {
  const { state } = useLocation();
  const selectedDestination = (state as { destination?: Destination } | null)?.destination;

  return <h1>주차 조건 설정: {selectedDestination?.name}</h1>;
};

const renderSearchPage = () =>
  renderWithProviders(
    <Routes>
      <Route path="/search" element={<SearchPage />} />
      <Route path="/parkingsetup" element={<ParkingSetupProbe />} />
    </Routes>,
    { initialEntries: ['/search'] },
  );

const search = async (keyword: string) => {
  const user = userEvent.setup();

  await user.type(screen.getByRole('textbox', { name: '목적지 검색' }), keyword);

  return user;
};

describe('A. 목적지 검색', () => {
  it('검색 결과를 선택하면 주차 조건 설정 화면으로 이동한다', async () => {
    renderSearchPage();
    const user = await search('강남역');

    await user.click(await screen.findByRole('button', { name: /강남역 11번 출구/ }));

    expect(
      screen.getByRole('heading', { name: '주차 조건 설정: 강남역 11번 출구' }),
    ).toBeInTheDocument();
  });

  it('검색 결과가 없으면 빈 결과를 안내한다', async () => {
    setMockScenario('destination-empty');
    renderSearchPage();

    await search('강남역');

    expect(await screen.findByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('검색 요청이 실패하면 오류를 안내하고 다시 검색할 수 있다', async () => {
    setMockScenario('destination-failed');
    renderSearchPage();
    const user = await search('강남역');

    expect(
      await screen.findByText('목적지를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();

    setMockScenario('success');
    const input = screen.getByRole('textbox', { name: '목적지 검색' });
    await user.clear(input);
    await user.type(input, '강남구청');

    expect(await screen.findByRole('button', { name: /강남구청/ })).toBeInTheDocument();
  });

  it('선택한 목적지가 최근 검색에 저장된다', async () => {
    renderSearchPage();
    const user = await search('강남역');

    await user.click(await screen.findByRole('button', { name: /강남역 11번 출구/ }));

    expect(JSON.parse(localStorage.getItem('recentSearches') ?? '[]')).toEqual([destination]);
  });
});
