import { Suspense } from 'react';
import { jest } from '@jest/globals';
import { act, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';

import { ParkingInformationContent } from '../../src/pages/HomePage/components/ParkingInformationContent';
import { parkingViewportLots } from '../../mocks/fixtures/parkingViewport';
import { viewportParkingLotDetailFixtures } from '../../mocks/fixtures/viewportParkingLotDetails';
import { renderWithProviders } from '../renderWithProviders';

import userEvent from '@testing-library/user-event';
import { mockGeolocation } from '../testData';
import { server } from '../msw/server';

const renderParkingInformation = (parkingLotId = 101) => {
  const parkingLot = parkingViewportLots.find(({ id }) => id === parkingLotId);

  if (!parkingLot) {
    throw new Error(`주차장 ID ${parkingLotId}의 목 데이터가 없습니다.`);
  }

  const detail = viewportParkingLotDetailFixtures[parkingLot.id];

  if (!detail) {
    throw new Error(`주차장 ID ${parkingLotId}의 상세 목 데이터가 없습니다.`);
  }

  return renderWithProviders(
    <Suspense fallback={<p>주차장 정보를 불러오는 중</p>}>
      <ParkingInformationContent parkingLot={parkingLot} data={detail} />
    </Suspense>,
  );
};

describe('홈페이지 주차장 상세정보', () => {
  it('상세 패널의 빠른 메뉴에서 좋아요 개수와 선택 여부를 표시한다', () => {
    renderParkingInformation();
    expect(screen.getByRole('button', { name: '좋아요 12개' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const actions = screen.getByRole('region', { name: '주차장 빠른 메뉴' });
    expect(within(actions).getAllByRole('button')).toHaveLength(3);
    expect(actions).toHaveStyle({
      gridTemplateColumns: 'minmax(0, 2fr) repeat(2, minmax(0, 1fr))',
    });
  });

  it('주차장을 바꾸면 이전 좋아요의 예약 요청과 선택 상태를 초기화한다', async () => {
    const requested = jest.fn();
    server.use(
      http.put('/api/parking/101/like', () => {
        requested();
        return HttpResponse.error();
      }),
    );
    const first = parkingViewportLots.find(({ id }) => id === 101);
    const next = parkingViewportLots.find(({ id }) => id === 102);
    const firstDetail = viewportParkingLotDetailFixtures[101];
    const nextDetail = viewportParkingLotDetailFixtures[102];
    if (!first || !next || !firstDetail || !nextDetail) {
      throw new Error('주차장 전환 테스트에 필요한 목 데이터가 없습니다.');
    }
    const { rerender } = renderWithProviders(
      <ParkingInformationContent parkingLot={first} data={firstDetail} />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: '좋아요 12개' }));
    expect(screen.getByRole('button', { name: '좋아요 13개' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    rerender(<ParkingInformationContent parkingLot={next} data={nextDetail} />);
    expect(screen.getByRole('button', { name: '좋아요 12개' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(requested).not.toHaveBeenCalled();
  });

  it('뷰포트 목록의 모든 주차장에 대한 상세 데이터가 있다', () => {
    expect(
      parkingViewportLots.every(({ id }) => viewportParkingLotDetailFixtures[id] !== undefined),
    ).toBe(true);
  });

  it('요금, 운영 정보와 시설 정보를 표시한다', () => {
    renderParkingInformation();

    expect(screen.getByText('기본 무료시간')).toBeInTheDocument();
    expect(screen.getByText('0분')).toBeInTheDocument();
    expect(screen.getByText('기본요금 시간')).toBeInTheDocument();
    expect(screen.getByText('30분')).toBeInTheDocument();
    expect(screen.getByText('3,000원')).toBeInTheDocument();
    expect(screen.getByText('추가요금 시간')).toBeInTheDocument();
    expect(screen.getByText('10분')).toBeInTheDocument();
    expect(screen.getByText('1,000원')).toBeInTheDocument();
    expect(screen.getByText('30,000원')).toBeInTheDocument();

    expect(screen.getByText('평일')).toBeInTheDocument();
    expect(screen.getByText('24시간')).toBeInTheDocument();
    expect(screen.getByText('유료')).toBeInTheDocument();
    expect(screen.getByText('토요일')).toBeInTheDocument();
    expect(screen.getByText('09:00 ~ 18:00')).toBeInTheDocument();
    expect(screen.getByText('무료')).toBeInTheDocument();
    expect(screen.getByText('일요일·공휴일')).toBeInTheDocument();
    expect(screen.getByText('휴무')).toBeInTheDocument();

    expect(screen.getByText('총 주차면 수')).toBeInTheDocument();
    expect(screen.getByText('42면')).toBeInTheDocument();
  });

  it('요금과 운영 정보가 없으면 미제공 상태를 표시한다', () => {
    renderParkingInformation(105);

    expect(screen.getByText('총 주차면 수')).toBeInTheDocument();
    expect(screen.getAllByText('미제공').length).toBeGreaterThan(0);
    expect(screen.getAllByText('운영 정보 없음')).toHaveLength(3);
    expect(screen.getAllByText('유료 여부 미제공')).toHaveLength(3);
  });

  it('하단 제보 버튼에서 신고 모달을 연다', async () => {
    renderParkingInformation();
    const user = userEvent.setup();
    const reportButton = await screen.findByRole('button', { name: '제보하기' });
    const actions = screen.getByRole('region', { name: '주차장 빠른 메뉴' });

    expect(actions).not.toContainElement(reportButton);
    expect(actions).toContainElement(screen.getByRole('button', { name: '길찾기 시작' }));
    expect(actions).toContainElement(screen.getByRole('button', { name: '로드뷰 보기' }));

    await user.click(reportButton);
    expect(screen.getByRole('dialog', { name: '주차장 정보 신고' })).toBeInTheDocument();
  });

  it('길찾기 버튼을 누르면 길찾기 앱 선택 모달을 연다', async () => {
    const getCurrentPosition = mockGeolocation();
    const user = userEvent.setup();

    renderParkingInformation();

    expect(screen.queryByRole('dialog', { name: '길찾기 앱 선택' })).not.toBeInTheDocument();
    expect(getCurrentPosition).not.toHaveBeenCalled();

    await user.click(
      await screen.findByRole('button', {
        name: '길찾기 시작',
      }),
    );

    expect(
      screen.getByRole('dialog', {
        name: '길찾기 앱 선택',
      }),
    ).toBeInTheDocument();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('로드뷰 버튼을 누르면 전체 화면 로드뷰를 열고 닫을 수 있다', async () => {
    renderParkingInformation();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '로드뷰 보기' }));

    expect(
      screen.getByRole('dialog', { name: '역삼문화공원 제1호 공영주차장 로드뷰' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '로드뷰 닫기' }));

    expect(screen.queryByRole('dialog', { name: /로드뷰$/ })).not.toBeInTheDocument();
  });
});
