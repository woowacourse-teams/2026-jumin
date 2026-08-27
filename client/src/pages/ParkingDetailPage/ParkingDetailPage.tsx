import { NaverMapMarker } from '../../../shared/maps/NaverMapMarker';

import { useEffect, useState } from 'react';

import { css } from '@emotion/css';

import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router';

import type {
  ParkingLotDetailResponse,
  ParkingLotSummary,
  ParkingOperationPeriod,
} from '../../../api/contracts';
import destinationMarkerUrl from '../../../assets/icons/markers/destinationMarker.svg';
import selectedParkingMarkerUrl from '../../../assets/icons/markers/selectedRecommandMarker.svg';

import BottomSheet, {
  BOTTOM_SHEET_HEIGHT,
  type BottomSheetSnap,
} from '../../../shared/components/BottomSheet';
import { DeepLinkModal } from '../../../shared/components/Modal/DeepLinkModal';
import { saveRecentParkingUse } from '../../../shared/utils/recentParkingUses';
import { getParkingLotDetail, type ParkingDetailParams } from '../../../api/parkingLots';

interface ParkingDetailSearchCondition extends ParkingDetailParams {
  destinationName?: string;
}

interface ParkingDetailLocationState {
  parkingLot?: ParkingLotSummary;
  searchCondition?: ParkingDetailSearchCondition;
}

const destinationMarkerIcon = {
  url: destinationMarkerUrl,
  width: 32,
  height: 32,
  anchorX: 16,
  anchorY: 16,
};

const parkingLotMarkerIcon = {
  url: selectedParkingMarkerUrl,
  width: 74,
  height: 90,
  anchorX: 37,
  anchorY: 73,
};

const formatFee = (fee: number | null) =>
  fee === null ? '미제공' : `${fee.toLocaleString('ko-KR')}원`;

const formatDuration = (entryAt: string, exitAt: string) => {
  const durationMinutes = Math.round(
    (new Date(exitAt).getTime() - new Date(entryAt).getTime()) / 60_000,
  );

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return '예상';

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;

  return `${hours}시간 ${minutes}분`;
};

const formatWeekdayHours = ({ status, openTime, closeTime }: ParkingOperationPeriod) => {
  if (status === 'CLOSED') return '평일 휴무';
  if (status === 'UNKNOWN' || openTime === null || closeTime === null) return '미제공';
  if (openTime === '00:00' && closeTime === '00:00') return '평일 24시간';

  return `평일 ${openTime} – ${closeTime}`;
};

const formatCheckedDate = (lastCheckedAt: string) => {
  const [year, month, day] = lastCheckedAt.slice(0, 10).split('-').map(Number);

  if (!year || !month || !day) return null;

  return `${year}.${month}.${day}`;
};

export const ParkingDetailPage = () => {
  const [isDeepLinkModalOpen, setIsDeepLinkModalOpen] = useState(false);
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('expanded');
  const map = useOutletContext<naver.maps.Map | null>();
  // 주차장의 상세정보 및 비동기 상태
  const [parkingLotDetail, setParkingLotDetail] = useState<ParkingLotDetailResponse | null>(null);

  const navigate = useNavigate();
  const { state } = useLocation();

  const navigationState = state as ParkingDetailLocationState | null;
  const parkingLot = navigationState?.parkingLot;
  const searchCondition = navigationState?.searchCondition;

  // 선택한 주차장의 ID로 상세 정보 가져오기
  useEffect(() => {
    if (!parkingLot || !searchCondition) {
      return;
    }

    let isCancelled = false;

    const fetchParkingLotDetail = async () => {
      try {
        setParkingLotDetail(null);

        const response = await getParkingLotDetail(parkingLot.id, searchCondition);

        if (isCancelled) return;

        setParkingLotDetail(response);
      } catch {
        if (isCancelled) return;
      }
    };

    void fetchParkingLotDetail();

    return () => {
      isCancelled = true;
    };
  }, [parkingLot, searchCondition]);

  useEffect(() => {
    if (!map || !parkingLotDetail || !searchCondition) return;

    const destinationPosition = new naver.maps.LatLng(
      searchCondition.destinationLatitude,
      searchCondition.destinationLongitude,
    );
    const parkingLotPosition = new naver.maps.LatLng(
      parkingLotDetail.location.latitude,
      parkingLotDetail.location.longitude,
    );

    map.fitBounds([destinationPosition, parkingLotPosition], {
      top: 112,
      right: 40,
      bottom: sheetSnap === 'expanded' ? BOTTOM_SHEET_HEIGHT + 24 : 124,
      left: 40,
      maxZoom: 16,
    });
  }, [map, parkingLotDetail, searchCondition, sheetSnap]);

  if (!parkingLot || !searchCondition) {
    return <Navigate to="/parkingsetup" replace />;
  }

  if (!parkingLotDetail) {
    return null;
  }

  const { feeRule, operation, source } = parkingLotDetail;
  const checkedDate = source ? formatCheckedDate(source.lastCheckedAt) : null;
  const durationLabel = formatDuration(searchCondition.entryAt, searchCondition.exitAt);

  return (
    <main className={pageStyle}>
      <NaverMapMarker
        map={map}
        latitude={searchCondition.destinationLatitude}
        longitude={searchCondition.destinationLongitude}
        icon={destinationMarkerIcon}
        title={searchCondition.destinationName ?? '목적지'}
        zIndex={20}
      />
      <NaverMapMarker
        map={map}
        latitude={parkingLotDetail.location.latitude}
        longitude={parkingLotDetail.location.longitude}
        icon={parkingLotMarkerIcon}
        title={parkingLotDetail.name}
        zIndex={30}
      />
      <header className={headerStyle}>
        <button
          className={backButtonStyle}
          type="button"
          aria-label="이전 화면으로 이동"
          onClick={() => navigate(-1)}
        >
          <BackIcon />
        </button>

        <h1 className={parkingNameStyle}>{parkingLot.name}</h1>
      </header>

      <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
        <div className={sheetContentStyle}>
          <section>
            <div className={feeCardStyle}>
              <div className={totalFeeStyle}>
                <span>{durationLabel} 예상 요금</span>
                <strong>{formatFee(parkingLotDetail.estimatedFee)}</strong>
              </div>

              <dl className={feeRuleListStyle}>
                {feeRule?.baseFreeMinutes !== null &&
                  feeRule?.baseFreeMinutes !== undefined &&
                  feeRule.baseFreeMinutes > 0 && (
                    <div>
                      <dt>기본 무료 {feeRule.baseFreeMinutes}분</dt>
                      <dd>0원</dd>
                    </div>
                  )}

                {feeRule && feeRule.baseMinutes !== null && feeRule.baseFee !== null && (
                  <div>
                    <dt>기본 {feeRule.baseMinutes}분</dt>
                    <dd>{formatFee(feeRule.baseFee)}</dd>
                  </div>
                )}

                {feeRule &&
                  feeRule.additionalMinutes !== null &&
                  feeRule.additionalFee !== null && (
                    <div>
                      <dt>추가 {feeRule.additionalMinutes}분당</dt>
                      <dd>{formatFee(feeRule.additionalFee)}</dd>
                    </div>
                  )}

                {!feeRule && (
                  <div>
                    <dt>요금 규칙</dt>
                    <dd>미제공</dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          <dl className={detailsStyle}>
            <div>
              <dt>거리</dt>

              <dd>직선거리 {parkingLotDetail.distanceMeters.toLocaleString('ko-KR')}m</dd>
            </div>

            <div>
              <dt>운영시간</dt>

              <dd>{formatWeekdayHours(operation.weekday)}</dd>
            </div>

            <div>
              <dt>잔여석</dt>

              <dd>미제공</dd>
            </div>
          </dl>

          <div className={sheetFooterStyle}>
            {source && (
              <p className={sourceStyle}>
                {source.name}
                {checkedDate && ` · ${checkedDate} 기준`}
              </p>
            )}

            <button
              className={navigationButtonStyle}
              type="button"
              onClick={() => setIsDeepLinkModalOpen(true)}
            >
              길찾기 시작
            </button>
          </div>
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
  pointer-events: none;

  width: 100%;
  height: 100%;

  overflow: hidden;

  color: #14213d;

  background: transparent;
`;

const headerStyle = css`
  position: relative;
  pointer-events: auto;

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

const sheetContentStyle = css`
  display: flex;

  flex-direction: column;

  min-height: 100%;
`;

const feeCardStyle = css`
  overflow: hidden;

  background: #fff;

  border: 1px solid #dfe4ef;

  border-radius: 18px;

  box-sizing: border-box;
`;

const feeRuleListStyle = css`
  display: grid;
  gap: 18px;

  margin: 0;
  padding: 20px 18px;

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
    color: #768197;
    font-weight: 500;
  }

  dd {
    color: #25314a;
    font-weight: 800;
  }
`;

const totalFeeStyle = css`
  display: flex;
  align-items: center;
  justify-content: space-between;

  min-height: 64px;
  padding: 0 18px;

  color: #18233d;
  font-size: 15px;
  font-weight: 800;

  background: #f0f2ff;

  strong {
    color: #4356d8;

    font-size: 17px;

    font-weight: 800;
  }
`;

const detailsStyle = css`
  display: grid;

  gap: 12px;

  margin: 44px 0 0;

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

const sourceStyle = css`
  margin: 24px 0 18px;

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

const sheetFooterStyle = css`
  margin-top: auto;
`;
