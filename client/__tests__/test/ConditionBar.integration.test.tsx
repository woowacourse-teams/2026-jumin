import { jest } from '@jest/globals';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConditionBar } from '../../shared/components/ConditionBar';
import { renderWithProviders } from '../renderWithProviders';

describe('검색 조건 헤더', () => {
  it('설명과 전달한 액션을 같은 행에 렌더링하고 액션 동작을 유지한다', async () => {
    const onAction = jest.fn();
    renderWithProviders(
      <ConditionBar
        title="강남역"
        description="9월 2일 10:00 - 9월 2일 11:00"
        onBack={jest.fn()}
        action={
          <button type="button" onClick={onAction}>
            시간 변경
          </button>
        }
      />,
    );
    const user = userEvent.setup();
    const header = screen.getByRole('banner', { name: '검색 조건' });
    const description = within(header).getByText('9월 2일 10:00 - 9월 2일 11:00');
    const action = within(header).getByRole('button', { name: '시간 변경' });

    expect(action.parentElement?.parentElement).toBe(description.parentElement);
    await user.click(action);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('액션을 전달하지 않은 기존 헤더에는 버튼을 추가하지 않는다', () => {
    renderWithProviders(
      <ConditionBar title="강남역" description="주차장 상세" onBack={jest.fn()} />,
    );

    expect(screen.getByText('주차장 상세')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('설명이 없어도 전달한 액션을 표시할 수 있다', () => {
    renderWithProviders(
      <ConditionBar
        title="강남역"
        onBack={jest.fn()}
        action={<button type="button">조건 수정</button>}
      />,
    );

    expect(screen.getByRole('button', { name: '조건 수정' })).toBeInTheDocument();
  });
});
