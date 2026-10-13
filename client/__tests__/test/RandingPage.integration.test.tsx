import { jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

import { LandingPage } from '../../src/pages/LandingPage/LandingPage';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/randing']}>
      <Routes>
        <Route path="/randing" element={<LandingPage />} />
        <Route path="/" element={<p>서비스 홈</p>} />
      </Routes>
    </MemoryRouter>,
  );

afterEach(() => {
  delete window.AddToHomeScreen;
  Reflect.deleteProperty(navigator, 'standalone');
});

it('첫 화면에 서비스 이동과 앱 설치 버튼을 표시하고 서비스 홈으로 이동한다', async () => {
  const user = userEvent.setup();
  renderPage();

  expect(screen.getByRole('button', { name: '앱 설치하기' })).toBeVisible();
  await user.click(screen.getAllByRole('link', { name: '주차의민족 이용하기' })[0]!);

  expect(screen.getByText('서비스 홈')).toBeInTheDocument();
});

it('설치창을 한 번 열고 브라우저의 설치 완료 이벤트를 받은 뒤 완료를 표시한다', async () => {
  const user = userEvent.setup();
  renderPage();
  const prompt = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  window.dispatchEvent(
    Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    }),
  );

  await user.click(screen.getByRole('button', { name: '앱 설치하기' }));

  expect(prompt).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '앱 설치하기' })).toBeEnabled();

  act(() => window.dispatchEvent(new Event('appinstalled')));

  expect(screen.getByRole('button', { name: '설치 완료' })).toBeDisabled();
});

it.each(['Mozilla/5.0 (Linux; Android 14)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)'])(
  '설치 이벤트가 없는 %s 환경에서도 버튼을 표시하고 한국어 설치 안내를 연다',
  async (userAgent) => {
    const user = userEvent.setup();
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    const show = jest.fn<AddToHomeScreenInstance['show']>().mockReturnValue({
      isStandAlone: false,
      canBeStandAlone: true,
      device: userAgent.includes('Android') ? 'ANDROID' : 'IOS',
    });
    window.AddToHomeScreen = () => ({
      show,
      clearModalDisplayCount: () => undefined,
      isStandAlone: () => false,
      closeModal: () => undefined,
      modalIsShowing: () => false,
    });
    renderPage();

    await user.click(screen.getByRole('button', { name: '앱 설치하기' }));

    expect(show).toHaveBeenCalledWith('ko');
    expect(screen.getByRole('button', { name: '앱 설치하기' })).toBeEnabled();
  },
);

it('설치창을 열지 못하면 오류를 알리고 다시 누를 수 있게 한다', async () => {
  const user = userEvent.setup();
  renderPage();
  window.dispatchEvent(
    Object.assign(new Event('beforeinstallprompt'), {
      prompt: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('설치 실패')),
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
    }),
  );

  await user.click(screen.getByRole('button', { name: '앱 설치하기' }));

  expect(screen.getByRole('status')).toHaveTextContent('설치창을 열지 못했어요.');
  expect(screen.getByRole('button', { name: '앱 설치하기' })).toBeEnabled();
});

it('설치된 iOS 앱에서 열면 설치 버튼을 비활성화한다', () => {
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  renderPage();

  expect(screen.getByRole('button', { name: '설치 완료' })).toBeDisabled();
});
