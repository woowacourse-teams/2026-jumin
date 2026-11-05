import { jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react';
import { lazy, type ComponentType } from 'react';
import { Link, Route, Routes } from 'react-router';

import { MapLayout } from '../../src/shared/maps/MapLayout';
import { renderWithProviders } from '../renderWithProviders';

const createPendingPage = () => {
  let resolve!: (module: { default: ComponentType }) => void;
  const module = new Promise<{ default: ComponentType }>((done) => {
    resolve = done;
  });

  return {
    Page: lazy(() => module),
    complete: () => resolve({ default: () => <h1>다음 페이지</h1> }),
  };
};

const createMap = jest.fn(() => ({ destroy: jest.fn() }));
let originalNaver: PropertyDescriptor | undefined;

beforeEach(() => {
  jest.useFakeTimers();
  originalNaver = Object.getOwnPropertyDescriptor(globalThis, 'naver');
  Object.defineProperty(globalThis, 'naver', {
    configurable: true,
    value: { maps: { Map: createMap, LatLng: class {}, LatLngBounds: class {} } },
  });
});

afterEach(() => {
  jest.useRealTimers();
  if (originalNaver) Object.defineProperty(globalThis, 'naver', originalNaver);
  else Reflect.deleteProperty(globalThis, 'naver');
});

const renderRoutes = async () => {
  const first = createPendingPage();
  const second = createPendingPage();
  const result = renderWithProviders(
    <>
      <nav aria-label="테스트 페이지 이동">
        <Link to="/">시작으로 이동</Link>
        <Link to="/first">첫 페이지로 이동</Link>
        <Link to="/second">둘째 페이지로 이동</Link>
        <Link to="/?filter=changed">조건 변경</Link>
      </nav>
      <Routes>
        <Route element={<MapLayout />}>
          <Route
            path="/"
            element={
              <main>
                <h1>시작 페이지</h1>
                <input aria-label="입력 유지 확인" />
              </main>
            }
          />
          <Route path="/first" element={<first.Page />} />
          <Route path="/second" element={<second.Page />} />
        </Route>
      </Routes>
    </>,
  );
  await act(async () => {});

  return { ...result, first, second };
};

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

it('500ms 전에는 표시하지 않고, 경로 전환 중 이전 페이지 대신 지도를 유지한다', async () => {
  const { first } = await renderRoutes();
  fireEvent.click(screen.getByRole('link', { name: '첫 페이지로 이동' }));

  expect(screen.queryByRole('heading', { name: '시작 페이지' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: '지도' })).toBeVisible();
  await advance(499);
  expect(screen.queryByRole('status', { name: '페이지를 불러오는 중' })).not.toBeInTheDocument();

  await advance(1);
  expect(screen.getByRole('status', { name: '페이지를 불러오는 중' })).toBeVisible();
  expect(createMap).toHaveBeenCalledTimes(1);

  await act(async () => first.complete());
  expect(screen.getByRole('heading', { name: '다음 페이지' })).toBeVisible();
  expect(screen.queryByRole('status', { name: '페이지를 불러오는 중' })).not.toBeInTheDocument();
  expect(createMap).toHaveBeenCalledTimes(1);
});

it('500ms 이내에 코드가 준비되면 스피너를 표시하지 않는다', async () => {
  const { first } = await renderRoutes();
  fireEvent.click(screen.getByRole('link', { name: '첫 페이지로 이동' }));
  await advance(200);
  await act(async () => first.complete());
  await advance(1_000);

  expect(screen.getByRole('heading', { name: '다음 페이지' })).toBeVisible();
  expect(screen.queryByRole('status', { name: '페이지를 불러오는 중' })).not.toBeInTheDocument();
});

it('표시 직후 코드가 준비돼도 최소 표시 시간 없이 폴백을 제거한다', async () => {
  const { first } = await renderRoutes();
  fireEvent.click(screen.getByRole('link', { name: '첫 페이지로 이동' }));
  await advance(500);
  expect(screen.getByRole('status', { name: '페이지를 불러오는 중' })).toBeVisible();
  await act(async () => first.complete());

  expect(screen.queryByRole('status', { name: '페이지를 불러오는 중' })).not.toBeInTheDocument();
});

it('대기 중 다른 경로로 이동하면 새 경로에서 500ms를 다시 센다', async () => {
  await renderRoutes();
  fireEvent.click(screen.getByRole('link', { name: '첫 페이지로 이동' }));
  await advance(400);
  fireEvent.click(screen.getByRole('link', { name: '둘째 페이지로 이동' }));
  await advance(499);
  expect(screen.queryByRole('status', { name: '페이지를 불러오는 중' })).not.toBeInTheDocument();
  await advance(1);
  expect(screen.getByRole('status', { name: '페이지를 불러오는 중' })).toBeVisible();

  fireEvent.click(screen.getByRole('link', { name: '시작으로 이동' }));
  await advance(1_000);
  expect(screen.getByRole('heading', { name: '시작 페이지' })).toBeVisible();
  expect(screen.queryByRole('status', { name: '페이지를 불러오는 중' })).not.toBeInTheDocument();
});

it('같은 경로에서 검색 조건만 바꾸면 페이지를 다시 마운트하지 않는다', async () => {
  await renderRoutes();
  fireEvent.change(screen.getByRole('textbox', { name: '입력 유지 확인' }), {
    target: { value: '유지할 입력' },
  });
  fireEvent.click(screen.getByRole('link', { name: '조건 변경' }));
  await advance(500);

  expect(screen.getByRole('textbox', { name: '입력 유지 확인' })).toHaveValue('유지할 입력');
  expect(screen.queryByRole('status', { name: '페이지를 불러오는 중' })).not.toBeInTheDocument();
  expect(createMap).toHaveBeenCalledTimes(1);
});
