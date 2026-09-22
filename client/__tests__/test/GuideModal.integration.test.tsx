import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { GuideModal } from '../../shared/components/Modal/GuideModal';

it('가이드를 닫고 다시 열면 첫 단계부터 시작한다', async () => {
  const user = userEvent.setup();
  const onClose = () => undefined;
  const { rerender } = render(<GuideModal isOpen onClose={onClose} />);

  await user.click(screen.getByRole('button', { name: '다음' }));
  expect(
    screen.getByRole('heading', { name: '언제 들어가고 나오는지만 입력하세요' }),
  ).toBeInTheDocument();

  rerender(<GuideModal isOpen={false} onClose={onClose} />);
  rerender(<GuideModal isOpen onClose={onClose} />);

  expect(
    screen.getByRole('heading', { name: '어디에 주차할지 고민하지 마세요' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '이전 단계' })).toBeDisabled();
});
