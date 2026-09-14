import { css } from '@emotion/css';
import { useSuspenseQuery } from '@tanstack/react-query';

import type {
  DailyOperationsDay,
  ParkingLotViewport,
  ViewportParkingLotDetailResponse,
} from '../../../../api/contracts';
import { viewportParkingLotDetailQueryOptions } from '../../../../api/queries/viewportParkingLotDetailQuery';
import { DeepLinkModal } from '../../../../shared/components/Modal/DeepLinkModal';
import { useModal } from '../../../../shared/hooks/useModal';

interface Props {
  parkingLot: ParkingLotViewport;
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

export const ParkingInformationContent = ({ parkingLot }: Props) => {
  const modal = useModal();

  const { data } = useSuspenseQuery(viewportParkingLotDetailQueryOptions(parkingLot.id));

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

  return (
    <section className={sheetContentStyle}>
      <header className={parkingHeaderStyle}>
        <h2 className={parkingNameStyle}>{data.name}</h2>
        <p className={addressStyle}>{data.address}</p>
      </header>

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
      <div className={sheetFooterStyle}>
        <button className={navigationButtonStyle} type="button" onClick={modal.open}>
          길찾기 시작
        </button>
      </div>

      <DeepLinkModal
        isOpen={modal.isOpen}
        onRequestClose={modal.close}
        destination={{
          name: data.name,
          location: {
            latitude: parkingLot.latitude,
            longitude: parkingLot.longitude,
          },
        }}
      />
    </section>
  );
};

const sheetContentStyle = css`
  display: flex;
  flex-direction: column;
  min-height: 100%;
`;

const parkingHeaderStyle = css`
  display: flex;
  flex-direction: column;
  gap: 8px;

  padding: 4px 0 20px;
`;

const parkingNameStyle = css`
  margin: 0;

  color: #18233d;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.35;
  letter-spacing: -0.6px;
`;

const addressStyle = css`
  margin: 0;

  color: #768197;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
`;

const sectionStyle = css`
  margin-top: 32px;
`;

const sectionTitleStyle = css`
  margin: 0 0 12px;

  color: #18233d;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.4;
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
    gap: 16px;
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
    text-align: right;
  }
`;

const operationListStyle = css`
  display: grid;
  gap: 16px;

  margin: 0;

  div {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
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
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;

    color: #2f3b55;
    font-weight: 750;
    text-align: right;
  }
`;

const subValueStyle = css`
  color: #9aa3b4;
  font-size: 12px;
  font-weight: 500;
`;

const detailsStyle = css`
  display: grid;
  gap: 12px;

  margin: 0;

  div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
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
    text-align: right;
  }
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
  margin-top: 32px;
`;
