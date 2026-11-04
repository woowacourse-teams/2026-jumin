import { Button } from '../../ui/Button';
import { Row } from '../../ui/Row';
import { css } from '@emotion/css';
import { ParkingReportModal } from './ParkingReportModal';
import { useParkingReport } from '../../../hooks/useParkingReport';
import { color } from '../../../../theme/color';
import { typography } from '../../../../theme/typography';

interface Props {
  parkingLotId: number;
}

export function ParkingReportAction({ parkingLotId }: Props) {
  const report = useParkingReport({ parkingLotId });

  return (
    <>
      <Row as="footer" align="center" justify="end" gap={8} className={reportActionStyle}>
        <span>정보가 다른가요?</span>
        <Button variant="ghost" size="lg" onClick={report.open}>
          제보하기
        </Button>
      </Row>

      {report.isOpen && <ParkingReportModal report={report} />}
    </>
  );
}

const reportActionStyle = css`
  flex-shrink: 0;

  margin-top: auto;
  padding-top: 24px;
  ${typography.caption};
  color: ${color.text.secondary};
`;
