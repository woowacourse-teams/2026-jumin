import { jest } from '@jest/globals';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../../App';
import { FEEDBACK_URL } from '../../shared/constants/help';
import { initializeInstallPrompt } from '../../shared/pwa/installPrompt';
import { renderWithProviders } from '../renderWithProviders';

beforeEach(() => {
  initializeInstallPrompt();
  window.dispatchEvent(new Event('appinstalled'));
});

afterEach(() => {
  delete window.AddToHomeScreen;
  Reflect.deleteProperty(navigator, 'standalone');
});

it('주변 탭 대신 설정 탭으로 이동하고 기존 랜딩페이지를 연다', async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { initialEntries: ['/recent'] });

  expect(screen.queryByRole('button', { name: '주변' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: '설정' }));

  expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '설정' })).toHaveAttribute('aria-current', 'page');
  const introduction = screen.getByRole('link', { name: /주차의민족 소개/ });
  expect(introduction).toHaveAttribute('href', '/randing');

  await user.click(introduction);
  expect(
    screen.getByRole('heading', { level: 1, name: /목적지를 입력하면, 주차장을 추천해드려요/ }),
  ).toBeInTheDocument();
});

it('설정에 직접 접속해 가이드를 열고 닫으며 다시 열면 첫 단계부터 시작한다', async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { initialEntries: ['/setting'] });

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /가이드 보기/ }));
  await user.click(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByText('총 3단계 중 2단계')).toBeInTheDocument();

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /가이드 보기/ }));
  expect(screen.getByText('총 3단계 중 1단계')).toBeInTheDocument();
});

it('피드백 버튼으로 기존 구글 폼을 새 탭에 연다', async () => {
  const user = userEvent.setup();
  const open = jest.spyOn(window, 'open').mockImplementation(() => null);
  renderWithProviders(<App />, { initialEntries: ['/setting'] });

  await user.click(screen.getByRole('button', { name: /피드백 보내기/ }));

  expect(open).toHaveBeenCalledWith(FEEDBACK_URL, '_blank', 'noopener,noreferrer');
});

it.each(['Android Chrome', 'iPhone Safari'])(
  '설치 이벤트가 없는 %s 환경에서도 설치 버튼을 표시하고 한국어 안내를 연다',
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
    renderWithProviders(<App />, { initialEntries: ['/setting'] });

    await user.click(screen.getByRole('button', { name: /앱 설치/ }));

    expect(show).toHaveBeenCalledWith('ko');
  },
);

it('Android 설치창을 한 번 열고 실제 설치 완료 이벤트를 받으면 완료를 표시한다', async () => {
  const user = userEvent.setup();
  jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android Chrome');
  renderWithProviders(<App />, { initialEntries: ['/setting'] });

  const prompt = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const installEvent = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
  });
  act(() => window.dispatchEvent(installEvent));
  await user.click(screen.getByRole('button', { name: /앱 설치/ }));

  expect(installEvent.defaultPrevented).toBe(true);
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('설치가 끝나면 홈 화면에서');
  act(() => window.dispatchEvent(new Event('appinstalled')));

  expect(screen.getByRole('button', { name: /설치 완료/ })).toBeDisabled();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('이미 설치한 iOS 앱에서는 설치 완료를 표시하고 설치 버튼을 비활성화한다', () => {
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  renderWithProviders(<App />, { initialEntries: ['/setting'] });

  expect(screen.getByRole('button', { name: /설치 완료/ })).toBeDisabled();
  expect(screen.getByText('이미 앱으로 이용하고 있어요.')).toBeInTheDocument();
});
