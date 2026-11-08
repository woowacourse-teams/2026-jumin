import { jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router';

import App from '../../App';
import { renderWithProviders } from '../renderWithProviders';

const destroyMap = jest.fn();
const createMap = jest.fn(() => ({ destroy: destroyMap }));
let originalNaver: PropertyDescriptor | undefined;

beforeEach(() => {
  originalNaver = Object.getOwnPropertyDescriptor(globalThis, 'naver');
  Object.defineProperty(globalThis, 'naver', {
    configurable: true,
    value: {
      maps: {
        Map: createMap,
        LatLng: class {},
        LatLngBounds: class {},
      },
    },
  });
});

afterEach(() => {
  if (originalNaver) Object.defineProperty(globalThis, 'naver', originalNaver);
  else Reflect.deleteProperty(globalThis, 'naver');
});

const renderApp = (path: string) =>
  renderWithProviders(
    <>
      <nav aria-label="테스트 페이지 이동">
        <Link to="/search?lat=37.4981&lng=127.0279">검색으로 이동</Link>
        <Link to="/setting">설정으로 이동</Link>
        <Link to="/admin">관리자로 이동</Link>
      </nav>
      <App />
    </>,
    { initialEntries: [path] },
  );

it('설정·최근 이용·검색을 왕복해도 지도 인스턴스를 유지한다', async () => {
  const user = userEvent.setup();
  const { unmount } = renderApp('/setting');
  await screen.findByRole('heading', { name: '설정', level: 1 });
  await waitFor(() => expect(createMap).toHaveBeenCalledTimes(1));

  await user.click(screen.getByRole('link', { name: '최근 이용' }));
  await screen.findByRole('heading', { name: '최근 이용', level: 1 });

  await user.click(screen.getByRole('link', { name: '검색으로 이동' }));
  await screen.findByRole('textbox', { name: '목적지 검색' });

  await user.click(screen.getByRole('link', { name: '설정으로 이동' }));
  await screen.findByRole('heading', { name: '설정', level: 1 });
  expect(createMap).toHaveBeenCalledTimes(1);
  expect(destroyMap).not.toHaveBeenCalled();

  unmount();
  expect(destroyMap).toHaveBeenCalledTimes(1);
});

it('랜딩으로 나가면 지도를 해제하고 서비스에 돌아올 때 새로 생성한다', async () => {
  const user = userEvent.setup();
  renderApp('/setting');
  await screen.findByRole('heading', { name: '설정', level: 1 });
  await waitFor(() => expect(createMap).toHaveBeenCalledTimes(1));

  await user.click(screen.getByRole('link', { name: /주차의민족 소개/ }));
  await screen.findByRole('heading', { name: /어디에 주차할지/, level: 1 });
  expect(destroyMap).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole('link', { name: '설정으로 이동' }));
  await screen.findByRole('heading', { name: '설정', level: 1 });
  await waitFor(() => expect(createMap).toHaveBeenCalledTimes(2));

  await user.click(screen.getByRole('link', { name: '관리자로 이동' }));
  await screen.findByRole('heading', { name: '관리자 페이지', level: 1 });
  expect(destroyMap).toHaveBeenCalledTimes(2);
});

it.each([
  { path: '/landing', heading: /어디에 주차할지/ },
  { path: '/admin', heading: /관리자 페이지/ },
])('$path 직접 진입 시 지도를 생성하지 않는다', async ({ path, heading }) => {
  renderApp(path);
  await screen.findByRole('heading', { name: heading, level: 1 });
  expect(createMap).not.toHaveBeenCalled();
});
