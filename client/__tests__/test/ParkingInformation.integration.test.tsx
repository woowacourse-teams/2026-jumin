import { Suspense } from 'react';
import { screen } from '@testing-library/react';

import { ParkingInformationContent } from '../../src/pages/HomePage/components/ParkingInformationContent';
import { parkingViewportLots } from '../../mocks/fixtures/parkingViewport';
import { viewportParkingLotDetailFixtures } from '../../mocks/fixtures/viewportParkingLotDetails';
import { renderWithProviders } from '../renderWithProviders';

const renderParkingInformation = (parkingLotId = 101) =>
  renderWithProviders(
    <Suspense fallback={<p>주차장 정보를 불러오는 중</p>}>
      <ParkingInformationContent parkingLotId={parkingLotId} />
    </Suspense>,
  );

describe('홈페이지 주차장 상세정보', () => {
  it('뷰포트 목록의 모든 주차장에 대한 상세 데이터가 있다', () => {
    expect(
      parkingViewportLots.every(({ id }) => viewportParkingLotDetailFixtures[id] !== undefined),
    ).toBe(true);
  });

  it('주차장 기본 정보, 요금, 운영 정보와 시설 정보를 표시한다', async () => {
    renderParkingInformation();

    expect(
      await screen.findByRole('heading', {
        name: '역삼문화공원 제1호 공영주차장',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('서울 강남구 테헤란로7길 21')).toBeInTheDocument();

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

  it('요금과 운영 정보가 없으면 미제공 상태를 표시한다', async () => {
    renderParkingInformation(105);

    expect(
      await screen.findByRole('heading', { name: '운영정보 확인 주차장' }),
    ).toBeInTheDocument();
    expect(screen.getByText('서울 강남구 역삼동')).toBeInTheDocument();
    expect(screen.getByText('총 주차면 수')).toBeInTheDocument();
    expect(screen.getAllByText('미제공').length).toBeGreaterThan(0);
    expect(screen.getAllByText('운영 정보 없음')).toHaveLength(3);
    expect(screen.getAllByText('유료 여부 미제공')).toHaveLength(3);
  });
});
