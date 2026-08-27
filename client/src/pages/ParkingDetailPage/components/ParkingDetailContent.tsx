import { useSuspenseQuery } from '@tanstack/react-query';
import { parkingDetailQueryOptions } from '../../../../api/queries/parkingDetailQuery';
import { ParkingDetailCondition } from '../../../../shared/types/navigation';
import { ParkingOperationPeriod } from '../../../../api/contracts';
import { css } from '@emotion/css';
import { DeepLinkModal } from '../../../../shared/components/Modal/DeepLinkModal';
import BottomSheet, { BottomSheetSnap } from '../../../../shared/components/BottomSheet';
import { useState } from 'react';
import { saveRecentParkingUse } from '../../../../shared/utils/recentParkingUses';

interface Props {
  detailCondition: ParkingDetailCondition;
}

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

export const ParkingDetailContent = ({ detailCondition }: Props) => {
  const [isDeepLinkModalOpen, setIsDeepLinkModalOpen] = useState(false);
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('expanded');

  const { data: parkingLotDetail } = useSuspenseQuery(
    parkingDetailQueryOptions({
      parkingLotId: detailCondition.parkingLotId,
      condition: {
        destinationLatitude: detailCondition.destinationLatitude,
        destinationLongitude: detailCondition.destinationLongitude,
        entryAt: detailCondition.entryAt,
        exitAt: detailCondition.exitAt,
      },
    }),
  );

  const { feeRule, operation, source } = parkingLotDetail;
  const checkedDate = source ? formatCheckedDate(source.lastCheckedAt) : null;
  const durationLabel = formatDuration(detailCondition.entryAt, detailCondition.exitAt);

  return (
    <div>
      <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
        <section className={sheetContentStyle}>
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

              {feeRule && feeRule.additionalMinutes !== null && feeRule.additionalFee !== null && (
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
        </section>
      </BottomSheet>

      <DeepLinkModal
        isOpen={isDeepLinkModalOpen}
        onRequestClose={() => setIsDeepLinkModalOpen(false)}
        onDirectionsStart={() => saveRecentParkingUse(parkingLotDetail)}
        destination={{ name: parkingLotDetail.name, location: parkingLotDetail.location }}
      />
    </div>
  );
};

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
