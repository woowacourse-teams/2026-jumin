import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';

import { HomePage } from '../../src/pages/HomePage/HomePage';
import { renderWithProviders } from '../renderWithProviders';

describe('통합 테스트 환경', () => {
  it('홈에서 목적지 검색 화면으로 이동할 수 있다', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<h1>목적지 검색</h1>} />
      </Routes>,
    );

    await user.click(screen.getByRole('button', { name: '목적지 검색하기' }));

    expect(screen.getByRole('heading', { name: '목적지 검색' })).toBeInTheDocument();
  });
});
