import { useState } from 'react';

import { css } from '@emotion/css';

import { Navigate, useLocation, useNavigate } from 'react-router';

import type { AvailabilityStatus, ParkingLotSummary } from '../../../api/contracts';
import { parkingSearchSuccess } from '../../../mocks/fixtures/parkingSearch';

import BottomSheet from '../../../shared/components/BottomSheet';
import { DeepLinkModal } from '../../../shared/components/Modal/DeepLinkModal';
import { saveRecentParkingUse } from '../../../shared/utils/recentParkingUses';

interface ParkingDetailLocationState {
  parkingLot?: ParkingLotSummary;
}

const availabilityLabel: Record<AvailabilityStatus, string> = {
  AVAILABLE: '주차 가능',

  UNAVAILABLE: '이용 불가',

  UNKNOWN: '미제공',
};

const formatFee = (fee: number | null) => (fee === null ? '미제공' : `${fee.toLocaleString('ko-KR')}원`);

export const ParkingDetailPage = () => {
  const [isDeepLinkModalOpen, setIsDeepLinkModalOpen] = useState(false);

  const navigate = useNavigate();

  const { state } = useLocation();

  const parkingLot =
    (state as ParkingDetailLocationState | null)?.parkingLot ??
    (__MSW_ENABLED__ ? parkingSearchSuccess.parkingLots[0] : undefined);

  if (!parkingLot) return <Navigate to="/parkingRecommendation" replace />;

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <button className={backButtonStyle} type="button" aria-label="이전 화면으로 이동" onClick={() => navigate(-1)}>
          <BackIcon />
        </button>

        <h1 className={parkingNameStyle}>{parkingLot.name}</h1>
      </header>

      <div className={parkingMarkerStyle} aria-hidden="true">
        <span />
      </div>

      <BottomSheet>
        <div className={sheetContentStyle}>
          <section>
            <h2 className={headlineStyle}>설정한 조건에서 제일 저렴해요</h2>

            <p className={sectionLabelStyle}>예상 요금</p>

            <div className={feeCardStyle}>
              <span>예상 총액</span>

              <strong>{formatFee(parkingLot.estimatedFee)}</strong>
            </div>
          </section>

          <dl className={detailsStyle}>
            <div>
              <dt>거리</dt>

              <dd>직선거리 {parkingLot.distanceMeters.toLocaleString('ko-KR')}m</dd>
            </div>

            <div>
              <dt>운영시간</dt>

              <dd>미제공</dd>
            </div>

            <div>
              <dt>이용 상태</dt>

              <dd>{availabilityLabel[parkingLot.availabilityStatus]}</dd>
            </div>
          </dl>

          <p className={addressStyle}>{parkingLot.address}</p>

          <button className={navigationButtonStyle} type="button" onClick={() => setIsDeepLinkModalOpen(true)}>
            길찾기 시작
          </button>
        </div>
      </BottomSheet>

      <DeepLinkModal
        isOpen={isDeepLinkModalOpen}
        onRequestClose={() => setIsDeepLinkModalOpen(false)}
        onDirectionsStart={() => saveRecentParkingUse(parkingLot)}
        destination={{ name: parkingLot.name, location: parkingLot.location }}
      />
    </main>
  );
};

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

const pageStyle = css`
  position: relative;

  width: min(100%, 390px);

  height: min(100dvh, 844px);

  min-height: 700px;

  margin: 0 auto;

  overflow: hidden;

  color: #14213d;

  background: #eef1f6;

  border-radius: 28px;
`;

const headerStyle = css`
  position: relative;

  z-index: 2;

  display: flex;

  align-items: center;

  height: 88px;

  padding: 24px 18px 0;

  box-sizing: border-box;

  background: #fff;
`;

const backButtonStyle = css`
  display: grid;

  flex: 0 0 40px;

  place-items: center;

  width: 40px;

  height: 40px;

  padding: 0;

  color: #62708a;

  background: transparent;

  border: 0;

  border-radius: 12px;

  cursor: pointer;

  svg {
    width: 22px;

    height: 22px;

    stroke: currentColor;

    stroke-width: 2;

    stroke-linecap: round;

    stroke-linejoin: round;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 25%);
  }
`;

const parkingNameStyle = css`
  min-width: 0;

  margin: 0;

  overflow: hidden;

  color: #18233d;

  font-size: 16px;

  font-weight: 800;

  line-height: 1.4;

  letter-spacing: -0.3px;

  text-overflow: ellipsis;

  white-space: nowrap;
`;

const parkingMarkerStyle = css`
  position: absolute;

  top: 222px;

  left: 50%;

  z-index: 1;

  display: grid;

  place-items: center;

  width: 30px;

  height: 30px;

  background: #fff;

  border-radius: 50%;

  box-shadow: 0 3px 10px rgb(20 33 61 / 30%);

  transform: translateX(-50%);

  span {
    width: 13px;

    height: 13px;

    background: #283754;

    border-radius: 50%;
  }
`;

const sheetContentStyle = css`
  display: flex;

  flex-direction: column;

  min-height: 100%;
`;

const headlineStyle = css`
  margin: 0 0 16px;

  color: #18233d;

  font-size: 20px;

  font-weight: 800;

  line-height: 1.35;

  letter-spacing: -0.6px;
`;

const sectionLabelStyle = css`
  margin: 0 0 10px;

  color: #18233d;

  font-size: 14px;

  font-weight: 750;
`;

const feeCardStyle = css`
  display: flex;

  align-items: center;

  justify-content: space-between;

  min-height: 64px;

  padding: 0 16px;

  color: #58657c;

  font-size: 14px;

  font-weight: 600;

  background: #f1f3ff;

  border: 1px solid #e1e5f5;

  border-radius: 14px;

  box-sizing: border-box;

  strong {
    color: #4356d8;

    font-size: 17px;

    font-weight: 800;
  }
`;

const detailsStyle = css`
  display: grid;

  gap: 10px;

  margin: auto 0 0;

  div {
    display: flex;

    align-items: center;

    justify-content: space-between;
  }

  dt,
  dd {
    margin: 0;

    font-size: 14px;

    line-height: 1.35;
  }

  dt {
    color: #8a94a8;
  }

  dd {
    color: #2f3b55;

    font-weight: 750;
  }
`;

const addressStyle = css`
  margin: 16px 0 18px;

  overflow: hidden;

  color: #9aa3b4;

  font-size: 11px;

  line-height: 1.4;

  text-overflow: ellipsis;

  white-space: nowrap;
`;

const navigationButtonStyle = css`
  width: 100%;

  min-height: 54px;

  color: #fff;

  font-family: inherit;

  font-size: 16px;

  font-weight: 800;

  background: #4356d8;

  border: 0;

  border-radius: 14px;

  cursor: pointer;

  &:active {
    background: #3548c8;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);

    outline-offset: 3px;
  }
`;
