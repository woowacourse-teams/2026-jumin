import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { jest } from '@jest/globals';

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

  it('홈 화면 설치 버튼을 누르면 한국어 설치 가이드를 연다', async () => {
    const user = userEvent.setup();
    const show = jest.fn(() => ({
      isStandAlone: false,
      canBeStandAlone: true,
      device: 'DESKTOP' as const,
    }));

    window.AddToHomeScreen = jest.fn(() => ({
      show,
      clearModalDisplayCount: jest.fn(),
      isStandAlone: jest.fn(() => false),
      closeModal: jest.fn(),
      modalIsShowing: jest.fn(() => false),
    }));

    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
    );

    await user.click(screen.getByRole('button', { name: /홈 화면에 설치/ }));

    expect(window.AddToHomeScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: '주차의민족',
        appIconUrl: '/icons/pwa-192.png',
      }),
    );
    expect(show).toHaveBeenCalledWith('ko');
  });
});
