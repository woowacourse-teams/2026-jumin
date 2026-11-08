import { css } from '@emotion/css';

import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useModal } from '../../../hooks/useModal';
import { hidePmfSurveyForThreeDays, shouldShowPmfSurvey } from './pmfSurveyVisibility';

const SURVEY_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSc_xHJgadFjn0S90DpLWxgRtWQtHxSV73ZquCzBW-se6F6-oQ/viewform?embedded=true';
const FORM_SCALE = 0.9;

export const PmfSurveyModal = () => {
  const { isOpen, close } = useModal(shouldShowPmfSurvey);

  if (!isOpen) return null;

  const hideForThreeDays = () => {
    hidePmfSurveyForThreeDays();
    close();
  };

  return (
    <Modal onClose={close} label="서비스 이용 경험 설문">
      <div className={formViewportStyle}>
        <iframe className={formStyle} src={SURVEY_URL} title="서비스 이용 경험 설문지" />
      </div>
      <Button variant="outline" isFullWidth className={hideButtonStyle} onClick={hideForThreeDays}>
        3일간 보지 않기
      </Button>
    </Modal>
  );
};

const formViewportStyle = css`
  width: 100%;
  height: min(50dvh, 400px);
  overflow: hidden;
`;

const formStyle = css`
  display: block;
  width: ${100 / FORM_SCALE}%;
  height: ${100 / FORM_SCALE}%;
  border: 0;
  transform: scale(${FORM_SCALE});
  transform-origin: top left;
`;

const hideButtonStyle = css`
  margin-top: 12px;
`;
