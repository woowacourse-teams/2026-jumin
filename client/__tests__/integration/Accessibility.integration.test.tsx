import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import ReactModal from 'react-modal';
import { SearchBar } from '../../src/shared/components/service/destination/SearchBar';
import { RecentHistoryRow } from '../../src/shared/components/service/RecentHistoryRow';
import { Modal } from '../../src/shared/components/ui/Modal';

// 포인터 없이 검색에 진입하고, 대화상자를 닫은 뒤 이전 조작을 이어갈 수 있어야 한다.
it.each(['{Enter}', ' '])('검색 진입 버튼을 %s 키로 실행한다', async (key) => {
  const onSearch = jest.fn();
  const user = userEvent.setup();
  render(<SearchBar onClick={onSearch} />);

  // 입력창으로 위장한 클릭 영역이 아니라 Tab으로 도달하는 네이티브 버튼이다.
  await user.tab();
  expect(screen.getByRole('button', { name: '목적지 검색' })).toHaveFocus();
  await user.keyboard(key);
  expect(onSearch).toHaveBeenCalledTimes(1);
});

it('검색 화면의 검색창에서는 텍스트를 입력하고 Enter로 검색을 실행한다', async () => {
  const onKeyDown = jest.fn();
  const user = userEvent.setup();
  render(<SearchBar onKeyDown={onKeyDown} />);

  // 진입 버튼과 달리 실제 검색 화면은 텍스트 편집 동작을 유지한다.
  const input = screen.getByRole('textbox', { name: '목적지 검색' });
  await user.type(input, '강남역');
  await user.keyboard('{Enter}');
  expect(input).toHaveValue('강남역');
  expect(onKeyDown).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'Enter' }));
});

it('최근 기록 삭제 버튼의 이름으로 대상을 구분하고 키보드로 삭제한다', async () => {
  const onRemove = jest.fn();
  const user = userEvent.setup();
  render(
    <ul>
      <RecentHistoryRow
        title="강남역"
        address="서울 강남구"
        onSelect={() => {}}
        onRemove={onRemove}
      />
    </ul>,
  );

  // 호출부에서 별도 레이블을 주지 않아도 삭제할 기록을 알 수 있어야 한다.
  await user.tab();
  await user.tab();
  expect(screen.getByRole('button', { name: '강남역 삭제' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(onRemove).toHaveBeenCalledTimes(1);
});

const ModalFlow = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>안내 열기</button>
      {open && (
        <Modal
          label="이용 안내"
          description="검색할 목적지를 선택하세요."
          onClose={() => setOpen(false)}
        >
          <button onClick={() => setOpen(false)}>확인</button>
        </Modal>
      )}
    </>
  );
};

it('모달의 제목·설명을 전달하고 Escape로 닫으면 열었던 버튼에 포커스를 돌린다', async () => {
  const appRoot = document.createElement('div');
  document.body.append(appRoot);
  ReactModal.setAppElement(appRoot);
  const user = userEvent.setup();
  const { unmount } = render(<ModalFlow />, { container: appRoot });

  try {
    await user.tab();
    const opener = screen.getByRole('button', { name: '안내 열기' });
    await user.keyboard('{Enter}');

    // 라이브러리의 모달 포커스 처리와 앱이 제공한 접근 가능한 설명을 함께 확인한다.
    const dialog = await screen.findByRole('dialog', { name: '이용 안내' });
    expect(dialog).toHaveAccessibleDescription('검색할 목적지를 선택하세요.');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  } finally {
    unmount();
    appRoot.remove();
  }
});
