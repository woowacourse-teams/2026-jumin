import { jest } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation, useNavigate } from 'react-router';

import type { ParkingDetailCondition, RecommendView } from '../../shared/types/navigation';
import {
  ParkingRecommendPage,
  type NavigationState,
} from '../../src/pages/ParkingRecommendPage/ParkingRecommendPage';
import { ParkingDetailPage } from '../../src/pages/ParkingDetailPage/ParkingDetailPage';
import { TestMapLayout } from '../TestMapLayout';
import { renderWithProviders } from '../renderWithProviders';
import { mockGeolocation, searchCondition, setMockScenario } from '../testData';

const NavigationProbe = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <output aria-label="테스트 라우트 상태">{JSON.stringify(location)}</output>
      <button type="button" onClick={() => navigate(1)}>
        테스트 앞으로가기
      </button>
      <button
        type="button"
        onClick={() =>
          navigate('/parkingRecommend', {
            state: {
              searchCondition: { ...searchCondition, destinationName: '새 목적지' },
            },
          })
        }
      >
        테스트 새 추천
      </button>
    </>
  );
};

const getRecommendationLocation = () =>
  JSON.parse(screen.getByLabelText('테스트 라우트 상태').textContent!) as {
    pathname: string;
    search: string;
    hash: string;
    state: NavigationState & { testMarker: string };
  };

const ParkingDetailProbe = () => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const detailCondition = (state as { detailCondition?: ParkingDetailCondition } | null)
    ?.detailCondition;

  return (
    <>
      <button type="button" onClick={() => navigate(-1)}>
        뒤로가기
      </button>
      <h1>주차장 상세: {detailCondition?.parkingLotName}</h1>
    </>
  );
};

const renderRecommendationPage = (
  initialRecommendView: RecommendView | null = null,
  detailElement = <ParkingDetailProbe />,
) =>
  renderWithProviders(
    <>
      <NavigationProbe />
      <Routes>
        <Route path="/before" element={<h1>추천 이전 화면</h1>} />
        <Route element={<TestMapLayout />}>
          <Route path="/parkingRecommend" element={<ParkingRecommendPage />} />
          <Route path="/parkingDetail" element={detailElement} />
        </Route>
      </Routes>
    </>,
    {
      initialEntries: [
        '/before',
        {
          pathname: '/parkingRecommend',
          search: '?source=test',
          hash: '#recommendations',
          state: {
            searchCondition,
            recommendView: initialRecommendView ?? undefined,
            testMarker: '보존할 상태',
          },
        },
      ],
    },
  );

const getParkingLotNames = (section: HTMLElement) =>
  within(section)
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);

describe('C. 추천 주차장', () => {
  it('추천 주차장을 거리순으로 확인할 수 있다', async () => {
    renderRecommendationPage();

    const recommendation = await screen.findByRole('region', {
      name: '거리순 추천 주차장',
    });

    expect(getParkingLotNames(recommendation)).toEqual([
      '청운 주차장',
      '역삼문화공원 제1호 공영주차장',
      '강남대로 공영주차장',
    ]);
    expect(within(recommendation).getByText('210m(4분)')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: '주차장 전체 목록' })).getByText('도보 정보 없음'),
    ).toBeInTheDocument();
  });

  it('정렬 기준을 변경하면 추천 순서가 변경된다', async () => {
    renderRecommendationPage();
    const user = userEvent.setup();

    await screen.findByRole('region', { name: '거리순 추천 주차장' });
    await user.click(screen.getByRole('tab', { name: '가격순' }));

    const priceRecommendation = screen.getByRole('region', { name: '가격순 추천 주차장' });
    expect(getParkingLotNames(priceRecommendation)).toEqual([
      '도곡로21길 공영주차장',
      '역삼문화공원 제1호 공영주차장',
      '강남대로 공영주차장',
    ]);
  });

  it('UI 변경은 현재 기록만 갱신하고 검색 조건과 다른 라우트 값을 유지한다', async () => {
    renderRecommendationPage();
    const user = userEvent.setup();
    await screen.findByRole('region', { name: '거리순 추천 주차장' });

    await user.click(screen.getByRole('tab', { name: '가격순' }));

    expect(getRecommendationLocation()).toEqual(
      expect.objectContaining({
        pathname: '/parkingRecommend',
        search: '?source=test',
        hash: '#recommendations',
        state: {
          searchCondition,
          testMarker: '보존할 상태',
          recommendView: { snap: 'collapsed', parkingLotId: null, recommendationType: 'PRICE' },
        },
      }),
    );

    await user.click(screen.getByRole('button', { name: '목록 확인 주차장 7 선택' }));
    expect(getRecommendationLocation().state.recommendView).toEqual({
      snap: 'expanded',
      parkingLotId: 112,
      recommendationType: 'PRICE',
    });

    await user.click(screen.getByRole('button', { name: '이전 화면으로 이동' }));
    expect(screen.getByRole('heading', { name: '추천 이전 화면' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '테스트 앞으로가기' }));
    expect(await screen.findByRole('tab', { name: '가격순' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: '목록 확인 주차장 7 선택' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('새 추천 기록에는 이전 UI를 적용하지 않고 뒤로가면 원래 기록을 복원한다', async () => {
    const originalScrollBy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollBy')!;
    const scrollBy = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
      configurable: true,
      value: scrollBy,
    });
    try {
      renderRecommendationPage({
        snap: 'expanded',
        parkingLotId: 101,
        recommendationType: 'PRICE',
      });
      const user = userEvent.setup();
      await screen.findByRole('region', { name: '가격순 추천 주차장' });

      await user.click(screen.getByRole('button', { name: '테스트 새 추천' }));
      expect(await screen.findByRole('region', { name: '거리순 추천 주차장' })).toBeInTheDocument();
      expect(getRecommendationLocation().state).toEqual({
        searchCondition: { ...searchCondition, destinationName: '새 목적지' },
      });
      expect(document.querySelector('[data-bottom-sheet]')).toHaveStyle({
        transform: 'translate3d(0, 390px, 0)',
      });

      scrollBy.mockClear();
      await user.click(screen.getByRole('button', { name: '이전 화면으로 이동' }));
      expect(await screen.findByRole('tab', { name: '가격순' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(
        screen.getByRole('button', { name: '역삼문화공원 제1호 공영주차장 선택' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(document.querySelector('[data-bottom-sheet]')).toHaveStyle({
        transform: 'translate3d(0, 0px, 0)',
      });
      // 같은 추천 컴포넌트가 유지되는 기록 간 뒤로가기에서도 카드를 복원한다.
      expect(scrollBy).toHaveBeenCalledWith({ left: 0, behavior: 'auto' });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollBy', originalScrollBy);
    }
  });

  it('복원 이후 정렬을 변경해도 이전 스크롤 복원을 반복하지 않는다', async () => {
    const originalScrollBy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollBy')!;
    const scrollBy = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
      configurable: true,
      value: scrollBy,
    });
    try {
      renderRecommendationPage({
        snap: 'expanded',
        parkingLotId: 101,
        recommendationType: 'PRICE',
      });
      const user = userEvent.setup();
      await screen.findByRole('region', { name: '가격순 추천 주차장' });
      expect(scrollBy).toHaveBeenCalled();
      scrollBy.mockClear();

      await user.click(screen.getByRole('tab', { name: '거리순' }));
      expect(scrollBy).not.toHaveBeenCalled();
      expect(getRecommendationLocation().state.recommendView).toEqual({
        snap: 'expanded',
        parkingLotId: null,
        recommendationType: 'DISTANCE',
      });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollBy', originalScrollBy);
    }
  });

  it('추천할 주차장이 없으면 빈 상태를 표시한다', async () => {
    setMockScenario('parking-empty');
    renderRecommendationPage();

    expect(await screen.findByText('추천할 수 있는 주차장이 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('조회된 주차장이 없습니다.')).toBeInTheDocument();
  });

  it('추천 조회 실패 후 다시 시도하면 목록을 표시한다', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setMockScenario('parking-server-error');
    renderRecommendationPage();
    const user = userEvent.setup();

    const error = await screen.findByRole('alert');
    expect(
      within(error).getByRole('heading', { name: '추천 주차장을 불러오지 못했어요' }),
    ).toBeInTheDocument();

    setMockScenario('success');
    await user.click(within(error).getByRole('button', { name: '다시 시도' }));

    const recommendation = await screen.findByRole('region', {
      name: '거리순 추천 주차장',
    });
    expect(
      within(recommendation).getByRole('heading', {
        name: '역삼문화공원 제1호 공영주차장',
      }),
    ).toBeInTheDocument();
  });

  it('추천 조회가 실패해도 기록을 유지하고 재시도 후 저장된 UI를 복원한다', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setMockScenario('parking-server-error');
    const recommendView: RecommendView = {
      snap: 'expanded',
      parkingLotId: 101,
      recommendationType: 'PRICE',
    };
    renderRecommendationPage(recommendView);
    const user = userEvent.setup();

    const error = await screen.findByRole('alert');
    expect(getRecommendationLocation().state.recommendView).toEqual(recommendView);

    setMockScenario('success');
    await user.click(within(error).getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('region', { name: '가격순 추천 주차장' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '역삼문화공원 제1호 공영주차장 선택' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(getRecommendationLocation().state.recommendView).toEqual(recommendView);
  });

  it('상세정보를 선택하면 해당 주차장 상세 화면으로 이동한다', async () => {
    renderRecommendationPage();
    const user = userEvent.setup();

    const recommendation = await screen.findByRole('region', {
      name: '거리순 추천 주차장',
    });
    const parkingLotHeading = within(recommendation).getByRole('heading', {
      name: '역삼문화공원 제1호 공영주차장',
    });
    const parkingLotCard = parkingLotHeading.closest('article');

    expect(parkingLotCard).not.toBeNull();
    await user.click(within(parkingLotCard!).getByRole('button', { name: '상세정보' }));

    expect(
      screen.getByRole('heading', {
        name: '주차장 상세: 역삼문화공원 제1호 공영주차장',
      }),
    ).toBeInTheDocument();
  });

  it('추천 카드의 상세정보에서 돌아오면 접힌 시트와 선택한 주차장을 복원한다', async () => {
    renderRecommendationPage();
    const user = userEvent.setup();

    const recommendation = await screen.findByRole('region', {
      name: '거리순 추천 주차장',
    });
    const card = within(recommendation)
      .getByRole('heading', { name: '역삼문화공원 제1호 공영주차장' })
      .closest('article');

    expect(card).not.toBeNull();
    await user.click(within(card!).getByRole('button', { name: '상세정보' }));
    await user.click(screen.getByRole('button', { name: '뒤로가기' }));

    expect(
      await screen.findByRole('button', { name: '역삼문화공원 제1호 공영주차장 선택' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: '바텀시트 접기' })).not.toBeInTheDocument();
    expect(getRecommendationLocation().state.recommendView).toEqual({
      snap: 'collapsed',
      parkingLotId: 101,
      recommendationType: 'DISTANCE',
    });

    // 이미 선택된 주차장으로 다시 이동해도 상세 기록은 한 번만 추가한다.
    const restoredRecommendation = screen.getByRole('region', { name: '거리순 추천 주차장' });
    const restoredCard = within(restoredRecommendation)
      .getByRole('heading', { name: '역삼문화공원 제1호 공영주차장' })
      .closest('article')!;
    await user.click(within(restoredCard).getByRole('button', { name: '상세정보' }));
    await user.click(screen.getByRole('button', { name: '뒤로가기' }));
    expect(await screen.findByRole('region', { name: '거리순 추천 주차장' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '이전 화면으로 이동' }));
    expect(screen.getByRole('heading', { name: '추천 이전 화면' })).toBeInTheDocument();
  });

  it('상세에서 지도 서비스를 선택해도 추천 기록을 지우지 않는다', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGeolocation();
    renderRecommendationPage(
      { snap: 'expanded', parkingLotId: 101, recommendationType: 'PRICE' },
      <ParkingDetailPage />,
    );
    const user = userEvent.setup();
    const recommendation = await screen.findByRole('region', { name: '가격순 추천 주차장' });
    const card = within(recommendation)
      .getByRole('heading', { name: '역삼문화공원 제1호 공영주차장' })
      .closest('article')!;
    await user.click(within(card).getByRole('button', { name: '상세정보' }));
    await user.click(await screen.findByRole('button', { name: '길찾기 시작' }));
    const dialog = screen.getByRole('dialog', { name: '길찾기 앱 선택' });
    const provider = within(dialog).getByRole('button', { name: /네이버 지도/ });
    await waitFor(() => expect(provider).toBeEnabled());
    await user.click(provider);
    await user.click(within(dialog).getByRole('button', { name: '길찾기 앱 선택 닫기' }));
    await user.click(screen.getByRole('button', { name: '이전 화면으로 이동' }));

    expect(await screen.findByRole('tab', { name: '가격순' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('button', { name: '역삼문화공원 제1호 공영주차장 선택' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-bottom-sheet]')).toHaveStyle({
      transform: 'translate3d(0, 0px, 0)',
    });
  });

  it('목록의 상세정보에서 돌아오면 펼친 시트와 정렬, 선택한 주차장 위치를 복원한다', async () => {
    const originalScrollBy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollBy')!;
    const scrollBy = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
      configurable: true,
      value: scrollBy,
    });

    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.matches('#parking-list-sheet > ul')) {
        return { top: 0, bottom: 300 } as DOMRect;
      }
      if (
        this.matches('#parking-list-sheet > ul > li') &&
        this.querySelector('h2')?.textContent === '목록 확인 주차장 7'
      ) {
        return { top: 800, bottom: 900 } as DOMRect;
      }
      return originalGetBoundingClientRect.call(this);
    });

    try {
      renderRecommendationPage({
        snap: 'expanded',
        parkingLotId: 101,
        recommendationType: 'PRICE',
      });
      const user = userEvent.setup();

      const parkingList = await screen.findByRole('region', { name: '주차장 전체 목록' });
      const row = within(parkingList)
        .getByRole('heading', { name: '목록 확인 주차장 7' })
        .closest('article');

      expect(row).not.toBeNull();
      await user.click(within(row!).getByRole('button', { name: '상세보기' }));
      scrollBy.mockClear();
      await user.click(screen.getByRole('button', { name: '뒤로가기' }));

      expect(
        await screen.findByRole('button', { name: '목록 확인 주차장 7 선택' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('tab', { name: '가격순' })).toHaveAttribute('aria-selected', 'true');
      expect(scrollBy).toHaveBeenCalledWith({ top: 600, behavior: 'auto' });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollBy', originalScrollBy);
    }
  });
});
