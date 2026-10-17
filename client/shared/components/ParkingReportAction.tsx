import { css } from '@emotion/css';
import { ParkingReportModal } from '../../src/pages/ParkingDetailPage/components/ParkingReportModal';
import { useParkingReport } from '../hooks/useParkingReport';
import { color } from '../../src/theme/color';
import { typography } from '../../src/theme/typography';

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
  ${typography.caption};
  color: ${color.text.secondary};
`;

const reportButtonStyle = css`
  flex-shrink: 0;
  min-height: 48px;
  padding: 0 8px;

  font-family: inherit;
  ${typography.label};
  color: ${color.text.secondary};
  text-align: center;

  background: none;
  border: 0;
  border-radius: 12px;
  cursor: pointer;

  &:hover {
    color: ${color.text.brand};
  }

  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
    outline-offset: 3px;
  }
`;
