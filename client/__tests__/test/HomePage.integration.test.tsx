import { act, screen } from '@testing-library/react';
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

  it('설치 이벤트가 없는 환경에서 홈 화면 설치 버튼을 누르면 한국어 설치 가이드를 연다', async () => {
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

  it('Android에서 홈 화면 설치 버튼을 누르면 브라우저 설치 창을 연다', async () => {
    const user = userEvent.setup();
    const originalUserAgent = window.navigator.userAgent;
    const prompt = jest.fn(async () => undefined);
    const userChoice = Promise.resolve({
      outcome: 'accepted' as const,
      platform: 'web',
    });

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/151.0 Mobile Safari/537.36',
    });

    const show = jest.fn(() => ({
      isStandAlone: false,
      canBeStandAlone: true,
      device: 'ANDROID' as const,
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

    expect(screen.queryByRole('button', { name: /홈 화면에 설치/ })).not.toBeInTheDocument();

    const installEvent = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice,
    });

    act(() => {
      window.dispatchEvent(installEvent);
    });

    await user.click(screen.getByRole('button', { name: /홈 화면에 설치/ }));

    expect(installEvent.defaultPrevented).toBe(true);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(show).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /홈 화면에 설치/ })).not.toBeInTheDocument();

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
  });
});
