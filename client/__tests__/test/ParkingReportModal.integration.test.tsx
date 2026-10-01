import { jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ParkingReportModal } from '../../src/pages/ParkingDetailPage/components/ParkingReportModal';
import { renderWithProviders } from '../renderWithProviders';
import { setMockScenario } from '../testData';

describe('주차장 신고 모달', () => {
  it('제목, 안내 문구, 글자 수와 비활성화된 전송 버튼을 표시한다', () => {
    renderWithProviders(<ParkingReportModal parkingLotId={101} onClose={() => undefined} />);

    expect(screen.getByRole('dialog', { name: '주차장 정보 신고' })).toBeInTheDocument();
    expect(screen.getByText('어떤 정보가 다른지 알려주세요.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '신고 내용' })).toHaveAttribute('maxlength', '400');
    expect(screen.getByText('0 / 400')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '신고 보내기' })).toBeDisabled();
  });

  it('입력 내용의 글자 수를 표시하고 공백만 있거나 400자를 초과하면 전송을 막는다', () => {
    renderWithProviders(<ParkingReportModal parkingLotId={101} onClose={() => undefined} />);
    const input = screen.getByRole('textbox', { name: '신고 내용' });
    const submitButton = screen.getByRole('button', { name: '신고 보내기' });

    fireEvent.change(input, { target: { value: '   ' } });
    expect(submitButton).toBeDisabled();

    fireEvent.change(input, { target: { value: '가'.repeat(400) } });
    expect(screen.getByText('400 / 400')).toBeInTheDocument();
    expect(submitButton).toBeEnabled();

    fireEvent.change(input, { target: { value: '가'.repeat(401) } });
    expect(submitButton).toBeDisabled();
  });

  it('전송 중 입력과 중복 전송을 막고 완료 후 확인 버튼으로 닫는다', async () => {
    setMockScenario('parking-report-slow');
    const onClose = jest.fn();
    renderWithProviders(<ParkingReportModal parkingLotId={101} onClose={onClose} />);
    const user = userEvent.setup();
    const input = screen.getByRole('textbox', { name: '신고 내용' });

    await user.type(input, '요금 정보가 달라요.');
    await user.click(screen.getByRole('button', { name: '신고 보내기' }));

    expect(await screen.findByRole('button', { name: '전송 중…' })).toBeDisabled();
    expect(input).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '주차장 정보 신고 닫기' }));
    expect(onClose).not.toHaveBeenCalled();

    expect(await screen.findByRole('status')).toHaveTextContent('신고가 접수됐어요.');
    expect(screen.getByText('알려주셔서 감사합니다.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('요청 실패 시 입력을 유지하며 오류를 표시하고 재시도할 수 있다', async () => {
    setMockScenario('parking-report-server-error');
    renderWithProviders(<ParkingReportModal parkingLotId={101} onClose={() => undefined} />);
    const user = userEvent.setup();
    const input = screen.getByRole('textbox', { name: '신고 내용' });

    await user.type(input, '요금 정보가 달라요.');
    await user.click(screen.getByRole('button', { name: '신고 보내기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('신고 접수에 실패했어요.');
    expect(input).toHaveValue('요금 정보가 달라요.');
    await waitFor(() => expect(screen.getByRole('button', { name: '신고 보내기' })).toBeEnabled());

    setMockScenario('success');
    await user.click(screen.getByRole('button', { name: '신고 보내기' }));
    expect(await screen.findByRole('status')).toHaveTextContent('신고가 접수됐어요.');
  });
});
