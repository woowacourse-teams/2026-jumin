import { act, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { MemoryRouter, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useStepNavigation } from '../../shared/hooks/useStepNavigation';
import { ParkingSetupPage } from '../../src/pages/ParkingSetupPage/ParkingSetupPage';
import { useSearchLocationQuery } from '../../src/pages/ParkingSetupPage/hooks/useSearchLocationQuery';
import { useCenterLocationQuery } from '../../src/pages/SearchPage/hooks/useCenterLocationQuery';
import { renderWithProviders } from '../renderWithProviders';

describe.each([
  { label: '검색 기준 위치', useCoordinates: useCenterLocationQuery },
  { label: '셋업 목적지', useCoordinates: useSearchLocationQuery },
])('$label query 검증', ({ useCoordinates }) => {
  it.each([
    '',
    '?lat=37.5',
    '?lng=127',
    '?lat=&lng=127',
    '?lat=37.5&lng=',
    '?lat=%20%20&lng=127',
    '?lat=37.5&lng=%20%20',
    '?lat=abc&lng=127',
    '?lat=Infinity&lng=127',
    '?lat=37.5&lng=-Infinity',
    '?lat=90.1&lng=127',
    '?lat=-90.1&lng=127',
    '?lat=37.5&lng=180.1',
    '?lat=37.5&lng=-180.1',
  ])('잘못된 좌표 %s는 null로 반환한다', (query) => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <MemoryRouter initialEntries={[`/${query}`]}>{children}</MemoryRouter>
    );
    const { result } = renderHook(useCoordinates, { wrapper });
    expect(result.current).toBeNull();
  });

  it.each([
    { latitude: 0, longitude: 0 },
    { latitude: 90, longitude: 180 },
    { latitude: -90, longitude: -180 },
  ])('유효한 좌표 $latitude, $longitude는 보존한다', (coordinates) => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <MemoryRouter initialEntries={[`/?lat=${coordinates.latitude}&lng=${coordinates.longitude}`]}>
        {children}
      </MemoryRouter>
    );
    const { result } = renderHook(useCoordinates, { wrapper });
    expect(result.current).toEqual(coordinates);
  });
});

const setupUrl = '/parkingsetup?lat=37.51&lng=127.04&name=강남역';
const LocationProbe = () => {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="현재 URL">{pathname + search}</output>
      <button onClick={() => navigate(-1)}>브라우저 뒤로가기</button>
    </>
  );
};

const renderSetup = (url = setupUrl) =>
  renderWithProviders(
    <>
      <LocationProbe />
      <Routes>
        <Route path="/origin" element={<h1>이전 화면</h1>} />
        <Route path="/" element={<h1>홈 화면</h1>} />
        <Route path="/search" element={<h1>검색 화면</h1>} />
        <Route path="/parkingRecommend" element={<h1>추천 화면</h1>} />
        <Route element={<Outlet context={{ map: null }} />}>
          <Route path="/parkingsetup" element={<ParkingSetupPage />} />
        </Route>
      </Routes>
    </>,
    { initialEntries: ['/origin', url] },
  );

const currentUrl = () =>
  new URL(screen.getByLabelText('현재 URL').textContent!, 'http://localhost');

it('직접 진입한 셋업의 검색바는 현재 좌표로 검색 화면을 push하고 취소는 뒤로 이동한다', async () => {
  const user = userEvent.setup();
  renderSetup();
  await user.click(screen.getByRole('textbox', { name: '목적지 검색' }));
  await screen.findByRole('heading', { name: '검색 화면' });
  expect(currentUrl().searchParams.get('lat')).toBe('37.51');
  expect(currentUrl().searchParams.get('lng')).toBe('127.04');
  expect(currentUrl().searchParams.has('name')).toBe(false);

  await user.click(screen.getByRole('button', { name: '브라우저 뒤로가기' }));
  await screen.findByRole('heading', { name: '강남역' });
  await user.click(screen.getByRole('button', { name: '목적지 선택 취소' }));
  await screen.findByRole('heading', { name: '이전 화면' });
});

it('셋업에서 확정한 목적지와 입출차 시각을 query로 전달하고 뒤로가면 목적지를 유지한다', async () => {
  const user = userEvent.setup();
  renderSetup();
  await user.click(screen.getByRole('button', { name: '다음' }));
  await screen.findByRole('heading', { name: '추천 화면' });
  const params = currentUrl().searchParams;
  expect(params.get('lat')).toBe('37.51');
  expect(params.get('lng')).toBe('127.04');
  expect(params.get('name')).toBe('강남역');
  const entryTime = Date.parse(params.get('entryAt')!);
  const exitTime = Date.parse(params.get('exitAt')!);
  expect(Number.isFinite(entryTime)).toBe(true);
  expect(exitTime - entryTime).toBe(60 * 60 * 1000);

  await user.click(screen.getByRole('button', { name: '브라우저 뒤로가기' }));
  await screen.findByRole('heading', { name: '강남역' });
  expect(currentUrl().searchParams.get('lat')).toBe('37.51');
  expect(currentUrl().searchParams.get('lng')).toBe('127.04');
});

it('잘못된 셋업 좌표는 검색을 거치지 않고 홈으로 replace한다', async () => {
  renderSetup('/parkingsetup?lat=Infinity&lng=127');
  await screen.findByRole('heading', { name: '홈 화면' });
  await userEvent.setup().click(screen.getByRole('button', { name: '브라우저 뒤로가기' }));
  await screen.findByRole('heading', { name: '이전 화면' });
});

const renderSetupNavigation = () =>
  renderHook(() => ({ ...useStepNavigation('setup'), location: useLocation() }), {
    wrapper: ({ children }: PropsWithChildren) => (
      <MemoryRouter initialEntries={['/origin', `${setupUrl}#pin`]}>{children}</MemoryRouter>
    ),
  });

it('같은 단계의 query 생략은 보존하고, 전달은 교체하며 replace는 히스토리를 늘리지 않는다', () => {
  const { result } = renderSetupNavigation();
  const originalQuery = result.current.location.search;
  act(() => result.current.move('CHANGE_DESTINATION'));
  expect(result.current.location.search).toBe(originalQuery);
  act(() => result.current.move('CHANGE_DESTINATION', 'lat=37.52&lng=127.05'));
  expect(result.current.location.search).toBe('?lat=37.52&lng=127.05');
  expect(result.current.location.hash).toBe('#pin');
  act(() => result.current.move('BACK'));
  expect(result.current.location.pathname).toBe('/origin');
});

it('빈 query는 제거하고 다른 단계로 push한 뒤에는 이전 URL로 돌아간다', () => {
  const { result } = renderSetupNavigation();
  act(() => result.current.move('CHANGE_DESTINATION', ''));
  expect(result.current.location.search).toBe('');
  act(() => result.current.move('CONFIRM_DESTINATION', '?lat=37.51&lng=127.04'));
  expect(result.current.location.pathname).toBe('/parkingRecommend');
  expect(result.current.location.search).toBe('?lat=37.51&lng=127.04');
  expect(result.current.location.hash).toBe('');
  act(() => result.current.move('BACK'));
  expect(result.current.location.pathname).toBe('/parkingsetup');
  expect(result.current.location.search).toBe('');
});
