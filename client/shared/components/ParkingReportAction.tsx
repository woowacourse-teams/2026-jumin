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
      <footer className={reportActionStyle}>
        <span>정보가 다른가요?</span>
        <button type="button" className={reportButtonStyle} onClick={report.open}>
          제보하기
        </button>
      </footer>

      {report.isOpen && <ParkingReportModal report={report} />}
    </>
  );
}

const reportActionStyle = css`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
  padding-top: 24px;
  color: #697386;
  font-size: 12px;
`;

const reportButtonStyle = css`
  flex-shrink: 0;
  min-height: 48px;
  padding: 0 8px;

  color: #697386;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;

  background: none;
  border: 0;
  border-radius: 12px;
  cursor: pointer;

  &:hover {
    color: #4356d8;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 3px;
  }
`;
