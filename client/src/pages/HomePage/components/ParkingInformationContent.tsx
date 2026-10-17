import { css } from '@emotion/css';

import type {
  DailyOperationsDay,
  ParkingLotViewport,
  ViewportParkingLotDetailResponse,
} from '../../../../api/contracts';
import { DeepLinkModal } from '../../../../shared/components/Modal/DeepLinkModal';
import { useModal } from '../../../../shared/hooks/useModal';
import { ParkingDetailActions } from '../../../../shared/components/ParkingDetailActions';
import { ParkingLikeButton } from '../../../../shared/components/ParkingLikeButton';
import { ParkingReportAction } from '../../../../shared/components/ParkingReportAction';
import { saveRecentParkingUse } from '../../../../shared/utils/recentParkingUses';
import { trackEvent } from '../../../../shared/analytics';
import { eventName } from '../../../../shared/monitoring/constants';
import { RoadViewOverlay } from '../../../../shared/components/RoadViewOverlay';
import { useState } from 'react';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';

interface Props {
  parkingLot: ParkingLotViewport;
  data: ViewportParkingLotDetailResponse;
}

type DailyOperation = ViewportParkingLotDetailResponse['dailyOperations'][number];

const operationDayLabel: Record<DailyOperationsDay, string> = {
  WEEKDAY: '평일',
  SATURDAY: '토요일',
  HOLIDAY: '일요일·공휴일',
};

const formatMinutes = (minutes: number | null | undefined) =>
  minutes === null || minutes === undefined ? '미제공' : `${minutes}분`;

const formatFee = (fee: number | null | undefined) =>
  fee === null || fee === undefined ? '미제공' : `${fee.toLocaleString('ko-KR')}원`;

const formatCapacity = (capacity: number | null) =>
  capacity === null ? '미제공' : `${capacity.toLocaleString('ko-KR')}면`;

const formatOperationTime = ({ status, openTime, closeTime }: DailyOperation) => {
  if (status === 'CLOSED') return '휴무';
  if (status === 'UNKNOWN') return '운영 정보 없음';

  if (openTime === null || closeTime === null) {
    return '운영시간 미제공';
  }

  if (openTime === '00:00' && closeTime === '00:00') {
    return '24시간';
  }

  return `${openTime} ~ ${closeTime}`;
};

const formatPaidStatus = (paid: boolean | null) => {
  if (paid === null) return '유료 여부 미제공';

  return paid ? '유료' : '무료';
};

export const ParkingInformationContent = ({ parkingLot, data }: Props) => {
  const modal = useModal();
  const [isRoadViewOpen, setIsRoadViewOpen] = useState(false);

  const recentParkingLot = {
    id: data.id,
    name: data.name,
    address: data.address,
    location: {
      latitude: parkingLot.latitude,
      longitude: parkingLot.longitude,
    },
  };

  const feeRows = [
    {
      label: '기본 무료시간',
      value: formatMinutes(data.feeRule?.baseFreeMinutes),
    },
    {
      label: '기본요금 시간',
      value: formatMinutes(data.feeRule?.baseMinutes),
    },
    {
      label: '기본요금 가격',
      value: formatFee(data.feeRule?.baseFee),
    },
    {
      label: '추가요금 시간',
      value: formatMinutes(data.feeRule?.additionalMinutes),
    },
    {
      label: '추가요금 가격',
      value: formatFee(data.feeRule?.additionalFee),
    },
    {
      label: '일일 최대 요금',
      value: formatFee(data.feeRule?.dailyMaxFee),
    },
  ];

  const handleDirectionButtonClick = () => {
    trackEvent(eventName.HOME_DIRECTIONS_BUTTON);
    modal.open();
  };

  const handleRoadViewButtonClick = () => {
    trackEvent(eventName.ROAD_VIEW_BUTTON, { surface: 'home' });
    setIsRoadViewOpen(true);
  };

  return (
    <section className={sheetContentStyle}>
      <ParkingDetailActions
        onDirections={handleDirectionButtonClick}
        onRoadView={handleRoadViewButtonClick}
      >
        <ParkingLikeButton
          key={data.id}
          parkingLotId={data.id}
          likeCount={data.likeCount}
          likedByMe={data.likedByMe}
        />
      </ParkingDetailActions>
      <div className={scrollContentStyle}>
        <section aria-label="요금 정보">
          <h3 className={sectionTitleStyle}>요금 정보</h3>

          <div className={feeCardStyle}>
            <dl className={feeRuleListStyle}>
              {feeRows.map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className={sectionStyle} aria-label="운영 정보">
          <h3 className={sectionTitleStyle}>운영 정보</h3>

          <dl className={operationListStyle}>
            {data.dailyOperations.map((operation) => (
              <div key={operation.day}>
                <dt>{operationDayLabel[operation.day]}</dt>

                <dd>
                  <span>{formatOperationTime(operation)}</span>
                  <span className={subValueStyle}>{formatPaidStatus(operation.paid)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={sectionStyle} aria-label="시설 정보">
          <h3 className={sectionTitleStyle}>시설 정보</h3>

          <dl className={detailsStyle}>
            <div>
              <dt>총 주차면 수</dt>
              <dd>{formatCapacity(data.capacity)}</dd>
            </div>
          </dl>
        </section>

        <ParkingReportAction parkingLotId={data.id} />

        {modal.isOpen && (
          <DeepLinkModal
            onRequestClose={modal.close}
            onDirectionsStart={() => {
              saveRecentParkingUse(recentParkingLot);
            }}
            destination={{
              name: data.name,
              location: {
                latitude: parkingLot.latitude,
                longitude: parkingLot.longitude,
              },
            }}
          />
        )}

        {isRoadViewOpen && (
          <RoadViewOverlay
            parkingLotName={data.name}
            parkingLotAddress={data.address}
            latitude={parkingLot.latitude}
            longitude={parkingLot.longitude}
            onRequestClose={() => setIsRoadViewOpen(false)}
          />
        )}
      </div>
    </section>
  );
};
const sheetContentStyle = css`
  display: flex;
  flex-direction: column;

  height: 100%;
  min-height: 0;
`;

const scrollContentStyle = css`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;

  overflow-y: auto;
  padding-inline-end: 15px;
  overscroll-behavior: contain;

  > section {
    flex-shrink: 0;
  }
`;

const sectionStyle = css`
  margin-top: 32px;
`;

const sectionTitleStyle = css`
  margin: 0 0 12px;

  color: ${color.text.primary};
  ${typography.titleCard}
`;

const feeCardStyle = css`
  overflow: hidden;

  background: ${color.background.default};
  border: 1px solid ${color.border.default};
  border-radius: 18px;
  box-sizing: border-box;
`;

const informationListBase = {
  display: 'grid',
  margin: 0,

  '> div': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },

  '> div > dt': {
    ...typography.bodySmall,
    margin: 0,
    color: color.text.secondary,
  },

  '> div > dd': {
    ...typography.bodySmallStrong,
    margin: 0,
    color: color.text.primary,
    textAlign: 'right',
  },
} as const;

const feeRuleListStyle = css(informationListBase, {
  gap: '18px',
  padding: '20px 18px',
});

const operationListStyle = css(informationListBase, {
  gap: '16px',

  '> div': {
    alignItems: 'flex-start',
  },

  '> div > dd': {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '4px',
  },
});

const subValueStyle = css`
  ${typography.caption};
  color: ${color.text.secondary};
`;

const detailsStyle = css(informationListBase, {
  gap: '12px',
});
