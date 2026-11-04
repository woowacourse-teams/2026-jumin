import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BottomSheet, { type BottomSheetSnap } from '../../src/shared/components/ui/BottomSheet';
import { useBottomSheet } from '../../src/shared/hooks/useBottomSheet';

const SheetExample = ({ acceptSnapChange = true }: { acceptSnapChange?: boolean }) => {
  const sheet = useBottomSheet({ initialIsOpen: true, initialSnap: 'medium' });

  return (
    <>
      <BottomSheet
        open={sheet.isOpen}
        snap={sheet.snap}
        onSnapChange={acceptSnapChange ? sheet.setSnap : () => {}}
      >
        시트 콘텐츠
      </BottomSheet>
      <output aria-label="사용처의 현재 단계">{sheet.snap}</output>
    </>
  );
};

const renderSheet = async (acceptSnapChange = true) => {
  const container = document.createElement('div');
  // JSDOM은 레이아웃을 계산하지 않으므로 컨테이너의 실제 측정값만 제공한다.
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: 800 });
  document.body.append(container);
  render(<SheetExample acceptSnapChange={acceptSnapChange} />, { container });

  const handle = screen.getByRole('slider', { name: '패널 높이 조절' });
  const sheet = handle.parentElement!;
  await waitFor(() => expect(handle).toHaveAttribute('aria-valuenow', '360'));

  // 드래그 시작 시 브라우저에서 읽는 높이를 현재 DOM 높이로 대체한다.
  jest
    .spyOn(sheet, 'getBoundingClientRect')
    .mockImplementation(() => new DOMRect(0, 0, 390, Number.parseFloat(sheet.style.height)));

  // JSDOM에 없는 포인터 캡처 API만 보완하며 시트의 이벤트 처리는 그대로 실행한다.
  const capturedPointers = new Set<number>();
  Object.defineProperties(handle, {
    setPointerCapture: { value: (id: number) => capturedPointers.add(id) },
    hasPointerCapture: { value: (id: number) => capturedPointers.has(id) },
    releasePointerCapture: { value: (id: number) => capturedPointers.delete(id) },
  });

  const expectSnap = (snap: BottomSheetSnap, height: number) => {
    expect(screen.getByLabelText('사용처의 현재 단계')).toHaveTextContent(snap);
    expect(handle).toHaveAttribute('aria-valuetext', snap);
    expect(handle).toHaveAttribute('aria-valuenow', String(height));
    // height는 드래그와 부모 snap의 정합성 계약에 포함되므로 DOM 값도 검증한다.
    expect(sheet.style.height).toBe(`${height}px`);
  };

  return { handle, sheet, expectSnap };
};

// JSDOM에서 PointerEvent 생성자가 없는 경우에도 좌표와 주 포인터 정보를 보존한다.
const firePointer = (
  handle: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  clientY: number,
) => {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientY });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'touch' },
    isPrimary: { value: true },
  });
  fireEvent(handle, event);
};

describe('바텀시트 사용처와 상호작용의 상태 연결', () => {
  it.each([
    { delta: 7, snap: 'medium', height: 360 },
    { delta: -7, snap: 'medium', height: 360 },
    { delta: 8, snap: 'expanded', height: 600 },
    { delta: -8, snap: 'collapsed', height: 110 },
  ] as const)(
    '$delta px 이동 후 사용처와 시트가 $snap 단계로 일치한다',
    async ({ delta, snap, height }) => {
      const { handle, sheet, expectSnap } = await renderSheet();

      firePointer(handle, 'pointerdown', 400);
      firePointer(handle, 'pointermove', 400 - delta);
      expect(sheet.style.height).toBe(`${360 + delta}px`);
      expect(screen.getByLabelText('사용처의 현재 단계')).toHaveTextContent('medium');

      firePointer(handle, 'pointerup', 400 - delta);
      expectSnap(snap, height);
    },
  );

  it('길게 드래그하면 이동 방향에서 놓은 높이와 가까운 단계로 이동한다', async () => {
    const { handle, expectSnap } = await renderSheet();

    firePointer(handle, 'pointerdown', 600);
    firePointer(handle, 'pointermove', 170);
    firePointer(handle, 'pointerup', 170);

    expectSnap('full', 800);
  });

  it('드래그 취소 시 기존 단계의 높이를 복원하고 다음 드래그를 받는다', async () => {
    const { handle, sheet, expectSnap } = await renderSheet();

    firePointer(handle, 'pointerdown', 400);
    firePointer(handle, 'pointermove', 200);
    expect(sheet.style.height).toBe('560px');
    firePointer(handle, 'pointercancel', 200);
    expectSnap('medium', 360);

    // 취소된 포인터의 늦은 종료 이벤트가 단계를 바꾸지 않아야 한다.
    firePointer(handle, 'pointerup', 200);
    expectSnap('medium', 360);

    firePointer(handle, 'pointerdown', 400);
    firePointer(handle, 'pointermove', 392);
    firePointer(handle, 'pointerup', 392);
    expectSnap('expanded', 600);
  });

  it('방향키로 네 단계를 이동하고 Home·End로 양 끝 단계를 선택한다', async () => {
    const user = userEvent.setup();
    const { handle, expectSnap } = await renderSheet();
    await user.tab();
    expect(handle).toHaveFocus();

    for (const [key, snap, height] of [
      ['{ArrowUp}', 'expanded', 600],
      ['{ArrowUp}', 'full', 800],
      ['{ArrowUp}', 'full', 800],
      ['{ArrowDown}', 'expanded', 600],
      ['{ArrowDown}', 'medium', 360],
      ['{ArrowDown}', 'collapsed', 110],
      ['{ArrowDown}', 'collapsed', 110],
      ['{End}', 'full', 800],
      ['{Home}', 'collapsed', 110],
    ] as const) {
      await user.keyboard(key);
      expectSnap(snap, height);
    }
  });

  it('사용처가 단계 변경을 거절하면 드래그한 높이를 기존 단계로 되돌린다', async () => {
    const { handle, sheet, expectSnap } = await renderSheet(false);

    firePointer(handle, 'pointerdown', 400);
    firePointer(handle, 'pointermove', 392);
    expect(sheet.style.height).toBe('368px');
    firePointer(handle, 'pointerup', 392);

    expectSnap('medium', 360);
  });
});
