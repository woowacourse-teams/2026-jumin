import type { FormEvent } from 'react';
import { css } from '@emotion/css';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import type { ParkingReport } from '../../../hooks/useParkingReport';
import { color } from '../../../../theme/color';
import { typography } from '../../../../theme/typography';

interface Props {
  report: ParkingReport;
}

export const ParkingReportModal = ({ report }: Props) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    report.submit();
  };

  return (
    <Modal
      onClose={report.close}
      label="주차장 정보 신고"
      description={report.isSuccess ? '알려주셔서 감사합니다.' : '어떤 정보가 다른지 알려주세요.'}
    >
      {report.isSuccess ? (
        <div className={successStyle}>
          <p className={successMessageStyle} role="status">
            신고가 접수됐어요.
          </p>
          <Button isFullWidth className={submitButtonStyle} onClick={report.close}>
            확인
          </Button>
        </div>
      ) : (
        <form className={formStyle} onSubmit={handleSubmit} aria-busy={report.isPending}>
          <textarea
            className={textareaStyle}
            id="parking-report-content"
            aria-label="신고 내용"
            placeholder="예: 주말에는 무료인데 유료라고 되어 있어요."
            value={report.content}
            onChange={(event) => report.setContent(event.target.value)}
            maxLength={400}
            disabled={report.isPending}
            aria-describedby={
              report.error ? 'parking-report-count parking-report-error' : 'parking-report-count'
            }
          />

          <p className={countStyle} id="parking-report-count">
            {report.content.length} / 400
          </p>

          {report.error && (
            <p className={errorStyle} id="parking-report-error" role="alert">
              {report.errorMessage}
            </p>
          )}

          <Button
            isFullWidth
            className={submitButtonStyle}
            type="submit"
            disabled={!report.canSubmit}
          >
            {report.isPending ? '전송 중…' : '신고 보내기'}
          </Button>
        </form>
      )}
    </Modal>
  );
};

const formStyle = css`
  width: 100%;
  padding-top: 16px;
  border-top: 1px solid ${color.border.default};
`;

const textareaStyle = css`
  display: block;
  width: 100%;
  min-height: 128px;
  padding: 14px;
  box-sizing: border-box;

  ${typography.body};
  color: ${color.text.primary};
  font-family: inherit;

  background: ${color.background.subtle};
  border: 1px solid ${color.border.default};
  border-radius: 14px;
  resize: vertical;

  &::placeholder {
    ${typography.caption};
    color: ${color.text.placeholder};
  }

  &:focus-visible {
    border-color: ${color.border.focused};
  }

  &:disabled {
    color: ${color.text.disabled};
    cursor: wait;
  }
`;

const countStyle = css`
  margin: 8px 0 0;
  ${typography.caption};
  color: ${color.text.secondary};
  text-align: right;
`;

const errorStyle = css`
  margin: 12px 0 0;
  ${typography.caption};
  color: ${color.text.error};
`;

const submitButtonStyle = css`
  margin-top: 16px;
`;

const successStyle = css`
  width: 100%;
  padding-top: 16px;
  border-top: 1px solid ${color.border.default};
`;

const successMessageStyle = css`
  margin: 8px 0;
  ${typography.label};
  color: ${color.text.primary};
  text-align: center;
`;
