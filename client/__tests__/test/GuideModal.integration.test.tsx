import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { GuideModal } from '../../shared/components/Modal/GuideModal';
import { useModal } from '../../shared/hooks/useModal';

const GuideModalHarness = () => {
  const modal = useModal(true);

  return modal.isOpen ? (
    <GuideModal onClose={modal.close} />
  ) : (
    <button type="button" onClick={modal.open}>
      가이드 다시 열기
    </button>
  );
};

it('가이드를 닫고 다시 열면 첫 단계부터 시작한다', async () => {
  const user = userEvent.setup();
  render(<GuideModalHarness />);

  await user.click(screen.getByRole('button', { name: '다음' }));
  expect(
    screen.getByRole('heading', { name: '언제 들어가고 나오는지만 입력하세요' }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '건너뛰기' }));
  expect(screen.queryByRole('dialog', { name: '주차의민족 이용 가이드' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '가이드 다시 열기' }));

  expect(
    screen.getByRole('heading', { name: '어디에 주차할지 고민하지 마세요' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '이전 단계' })).toBeDisabled();
});
