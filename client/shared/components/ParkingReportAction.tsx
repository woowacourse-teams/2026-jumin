import { css } from '@emotion/css';
import { ParkingReportModal } from '../../src/pages/ParkingDetailPage/components/ParkingReportModal';
import { useParkingReport } from '../hooks/useParkingReport';

interface Props {
  parkingLotId: number;
}

export function ParkingReportAction({ parkingLotId }: Props) {
  const report = useParkingReport({ parkingLotId });

  return (
    <>
      <div className={reportActionStyle}>
        <span>주차장 정보가 다른가요?</span>

        <button type="button" className={reportButtonStyle} onClick={report.open}>
          신고하기
        </button>
      </div>

      {report.isOpen && <ParkingReportModal report={report} />}
    </>
  );
}

const reportButtonStyle = css`
  flex-shrink: 0;
  min-height: 32px;
  padding: 0;

  color: #7f8a9f;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.4;
  text-align: right;
  text-decoration: underline;
  text-underline-offset: 3px;

  background: none;
  border: 0;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    color: #4356d8;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 3px;
  }
`;

const reportActionStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  margin-left: auto;

  color: #7f8a9f;
  font-size: 11px;
`;
