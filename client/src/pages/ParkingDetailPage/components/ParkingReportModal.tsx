import { useState } from 'react';
import { css } from '@emotion/css';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { useMutation } from '@tanstack/react-query';
import { submitParkingReport } from '../../../../api/reportParkingData';

interface Props {
  parkingLotId: number;
  onClose: () => void;
}

export const ParkingReportModal = ({ parkingLotId, onClose }: Props) => {
  const [content, setContent] = useState('');

  const reportMutation = useMutation({
    mutationFn: (reportContent: string) => submitParkingReport(parkingLotId, reportContent),
    retry: false,
  });

  const canSubmit = content.trim().length > 0 && content.length <= 400 && !reportMutation.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) return;

    reportMutation.mutate(content.trim());
  };

  // 요청 중에는 닫기 버튼·배경 클릭·Escape로 닫히지 않도록 처리
  const handleClose = () => {
    if (reportMutation.isPending) return;

    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      label="주차장 정보 신고"
      description={
        reportMutation.isSuccess ? '알려주셔서 감사합니다.' : '어떤 정보가 다른지 알려주세요.'
      }
    >
      {reportMutation.isSuccess ? (
        <div className={successStyle}>
          <p className={successMessageStyle} role="status">
            신고가 접수됐어요.
          </p>
          <button className={submitButtonStyle} type="button" onClick={onClose}>
            확인
          </button>
        </div>
      ) : (
        <form className={formStyle} onSubmit={handleSubmit} aria-busy={reportMutation.isPending}>
          <textarea
            className={textareaStyle}
            id="parking-report-content"
            aria-label="신고 내용"
            placeholder="예: 주말에는 무료인데 유료라고 되어 있어요."
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={400}
            disabled={reportMutation.isPending}
            aria-describedby={
              reportMutation.isError
                ? 'parking-report-count parking-report-error'
                : 'parking-report-count'
            }
          />

          <p className={countStyle} id="parking-report-count">
            {content.length} / 400
          </p>

          {reportMutation.isError && (
            <p className={errorStyle} id="parking-report-error" role="alert">
              {reportMutation.error.message}
            </p>
          )}

          <button className={submitButtonStyle} type="submit" disabled={!canSubmit}>
            {reportMutation.isPending ? '전송 중…' : '신고 보내기'}
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
