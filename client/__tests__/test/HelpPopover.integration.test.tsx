import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HelpPopover } from '../../src/pages/HomePage/components/HelpPopover';

it('메뉴 항목을 선택하거나 바깥쪽과 Escape를 누르면 해당 동작을 호출한다', async () => {
  const user = userEvent.setup();
  const onClose = jest.fn();
  const onGuideClick = jest.fn();
  const onInstallClick = jest.fn();
  const onFeedbackClick = jest.fn();

  render(
    <HelpPopover
      onClose={onClose}
      onGuideClick={onGuideClick}
      onInstallClick={onInstallClick}
      onFeedbackClick={onFeedbackClick}
      isInstallAvailable
    />,
  );

  await user.click(screen.getByRole('button', { name: '가이드 보기' }));
  await user.click(screen.getByRole('button', { name: '앱 설치' }));
  await user.click(screen.getByRole('button', { name: '피드백 작성' }));
  await user.click(screen.getByRole('button', { name: '메뉴 바깥 영역' }));
  await user.keyboard('{Escape}');

  expect(onGuideClick).toHaveBeenCalledTimes(1);
  expect(onInstallClick).toHaveBeenCalledTimes(1);
  expect(onFeedbackClick).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(5);
});
