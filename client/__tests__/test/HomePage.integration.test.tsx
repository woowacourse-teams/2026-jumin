import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';

import { HomePage } from '../../src/pages/HomePage/HomePage';
import { TestMapLayout } from '../TestMapLayout';
import { renderWithProviders } from '../renderWithProviders';

describe('통합 테스트 환경', () => {
  it('홈에서 목적지 검색 화면으로 이동할 수 있다', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route element={<TestMapLayout />}>
          <Route path="/" element={<HomePage />} />
        </Route>
        <Route path="/search" element={<h1>목적지 검색</h1>} />
      </Routes>,
    );

    await user.click(screen.getByRole('textbox', { name: '목적지 검색' }));

    expect(screen.getByRole('heading', { name: '목적지 검색' })).toBeInTheDocument();
  });

  it('홈에서 주차장 필터를 독립적으로 선택할 수 있다', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route element={<TestMapLayout />}>
          <Route path="/" element={<HomePage />} />
        </Route>
      </Routes>,
    );

    const freeFilter = screen.getByRole('button', { name: '무료 주차장' });
    const mechanicalFilter = screen.getByRole('button', { name: '기계식 주차장' });

    expect(freeFilter).toHaveAttribute('aria-pressed', 'false');
    expect(mechanicalFilter).toHaveAttribute('aria-pressed', 'false');

    await user.click(freeFilter);
    expect(freeFilter).toHaveAttribute('aria-pressed', 'true');
    expect(mechanicalFilter).toHaveAttribute('aria-pressed', 'false');

    await user.click(mechanicalFilter);
    expect(freeFilter).toHaveAttribute('aria-pressed', 'true');
    expect(mechanicalFilter).toHaveAttribute('aria-pressed', 'true');
  });
});
