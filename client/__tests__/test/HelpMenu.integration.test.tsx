import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HelpMenu } from '../../src/pages/HomePage/components/HelpMenu';

it('첫 방문에 가이드를 자동으로 열고, 닫은 뒤에는 자동으로 다시 열지 않는다', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<HelpMenu />);

  expect(screen.getByRole('dialog', { name: '주차의민족 이용 가이드' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '건너뛰기' }));
  expect(localStorage.getItem('jucha-guide-seen-v2')).toBe('true');

  unmount();
  render(<HelpMenu />);
  expect(screen.queryByRole('dialog', { name: '주차의민족 이용 가이드' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '도움말 메뉴 열기' }));
  await user.click(screen.getByRole('button', { name: '가이드 보기' }));
  expect(screen.getByRole('dialog', { name: '주차의민족 이용 가이드' })).toBeInTheDocument();
});

it('메뉴를 열면 닫기 아이콘으로 바뀌고, 바깥을 누르면 닫힌다', async () => {
  const user = userEvent.setup();
  const { container } = render(<HelpMenu />);

  const openButton = screen.getByRole('button', { name: '도움말 메뉴 열기' });
  expect(openButton).toHaveAttribute('aria-expanded', 'false');

  await user.click(openButton);
  expect(screen.getByRole('button', { name: '도움말 메뉴 닫기' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(screen.getByRole('button', { name: '가이드 보기' })).toBeInTheDocument();

  const backdrop = container.querySelector('div[aria-hidden="true"]');
  expect(backdrop).not.toBeNull();
  await user.click(backdrop!);
  expect(screen.getByRole('button', { name: '도움말 메뉴 열기' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(screen.queryByRole('button', { name: '가이드 보기' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '도움말 메뉴 열기' }));
  await user.click(screen.getByRole('button', { name: '도움말 메뉴 닫기' }));
  expect(screen.queryByRole('button', { name: '가이드 보기' })).not.toBeInTheDocument();
});

it('가이드 선택 시 메뉴를 닫고 가이드 모달을 연다', async () => {
  const user = userEvent.setup();
  render(<HelpMenu />);

  await user.click(screen.getByRole('button', { name: '도움말 메뉴 열기' }));
  await user.click(screen.getByRole('button', { name: '가이드 보기' }));

  expect(screen.queryByRole('button', { name: '가이드 보기' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: '주차의민족 이용 가이드' })).toBeInTheDocument();
});

it('피드백 선택 시 구글 폼을 새 탭으로 연다', async () => {
  const user = userEvent.setup();
  const open = jest.spyOn(window, 'open').mockImplementation(() => null);
  render(<HelpMenu />);

  await user.click(screen.getByRole('button', { name: '도움말 메뉴 열기' }));
  await user.click(screen.getByRole('button', { name: '피드백 작성' }));

  expect(open).toHaveBeenCalledWith(
    expect.stringContaining('docs.google.com/forms/'),
    '_blank',
    'noopener,noreferrer',
  );
  expect(screen.queryByRole('button', { name: '피드백 작성' })).not.toBeInTheDocument();
});

it('앱 설치를 선택하면 메뉴를 닫는다', async () => {
  const user = userEvent.setup();
  render(<HelpMenu />);

  await user.click(screen.getByRole('button', { name: '도움말 메뉴 열기' }));
  await user.click(screen.getByRole('button', { name: '앱 설치' }));

  expect(screen.queryByRole('button', { name: '앱 설치' })).not.toBeInTheDocument();
});
