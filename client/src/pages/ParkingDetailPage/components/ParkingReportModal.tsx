import type { FormEvent } from 'react';
import { css } from '@emotion/css';
import { Modal } from '../../../../shared/components/Modal/Modal';
import type { ParkingReport } from '../../../../shared/hooks/useParkingReport';

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
          <button className={submitButtonStyle} type="button" onClick={report.close}>
            확인
          </button>
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

          <button className={submitButtonStyle} type="submit" disabled={!report.canSubmit}>
            {report.isPending ? '전송 중…' : '신고 보내기'}
          </button>
        </form>
      )}
    </Modal>
  );
};

const formStyle = css`
  width: 100%;
  padding-top: 16px;
  border-top: 1px solid #edf0f5;
`;

const textareaStyle = css`
  display: block;
  width: 100%;
  min-height: 128px;
  padding: 14px;
  box-sizing: border-box;

  color: #18233d;
  font-family: inherit;
  font-size: 16px;
  line-height: 1.5;

  background: #f5f6fb;
  border: 1px solid #dfe4ef;
  border-radius: 14px;
  resize: vertical;

  &::placeholder {
    color: #8a94a8;
    font-size: 12px;
  }

  &:focus-visible {
    border-color: #4356d8;
    outline: 3px solid rgb(67 86 216 / 20%);
  }

  &:disabled {
    color: #7f8a9f;
    cursor: wait;
  }
`;

const countStyle = css`
  margin: 8px 0 0;
  color: #8a94a8;
  font-size: 12px;
  line-height: 1.5;
  text-align: right;
`;

const errorStyle = css`
  margin: 12px 0 0;
  color: #d64545;
  font-size: 12px;
  line-height: 1.5;
`;

const submitButtonStyle = css`
  width: 100%;
  min-height: 48px;
  margin-top: 16px;
  padding: 12px 16px;

  color: #fff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.5;

  background: #4356d8;
  border: 0;
  border-radius: 14px;
  cursor: pointer;

  &:active:not(:disabled) {
    background: #3548c8;
  }

  &:disabled {
    color: #7f8a9f;
    background: #dce0ec;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 3px;
  }
`;

const successStyle = css`
  width: 100%;
  padding-top: 16px;
  border-top: 1px solid #edf0f5;
`;

const successMessageStyle = css`
  margin: 8px 0;
  color: #18233d;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
  text-align: center;
`;
