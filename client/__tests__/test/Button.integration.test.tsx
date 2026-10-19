import { jest } from '@jest/globals';
import { css } from '@emotion/css';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from '../../shared/components/ui/Button';
import { ParkingDetailActions } from '../../shared/components/service/parking/ParkingDetailActions';
import { color } from '../../src/theme/color';
import { renderWithProviders } from '../renderWithProviders';

const icon = (
  <svg viewBox="0 0 24 24" role="img" aria-label="길찾기 아이콘">
    <path d="m3 10 18-7-7 18-4-7-7-4Z" />
  </svg>
);

describe('공용 버튼의 아이콘', () => {
  it('아이콘과 문구를 분리하고 아이콘은 접근성 이름에서 제외한다', () => {
    render(<Button icon={icon}>길찾기</Button>);
    const button = screen.getByRole('button', { name: '길찾기' });
    const iconSlot = button.querySelector('span[aria-hidden="true"]');

    expect(iconSlot?.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '길찾기 아이콘' })).not.toBeInTheDocument();
    expect(button).not.toHaveAttribute('icon');
  });

  it.each([
    ['sm', '1rem'],
    ['md', '1.125rem'],
    ['lg', '1.375rem'],
  ] as const)('%s 크기의 아이콘 영역을 %s로 고정한다', (size, iconSize) => {
    render(
      <Button size={size} icon={icon}>
        길찾기
      </Button>,
    );
    const iconSlot = screen.getByRole('button', { name: '길찾기' }).querySelector('span');

    expect(iconSlot).toHaveStyle({ width: iconSize, height: iconSize, flexShrink: '0' });
    expect(iconSlot?.querySelector('svg')).toHaveStyle({ width: '100%', height: '100%' });
  });

  it('아이콘이 없으면 아이콘 영역을 만들지 않는다', () => {
    render(<Button>다음</Button>);

    expect(screen.getByRole('button', { name: '다음' }).querySelector('span')).toBeNull();
  });

  it.each([
    ['sm', '2.75rem', '0rem 0.625rem', '0.75rem', '0.375rem'],
    ['md', '3rem', '0rem 0.25rem', '0.75rem', '0.25rem'],
    ['lg', '3.25rem', '0rem 1.25rem', '0.875rem', '0.5rem'],
  ] as const)(
    '%s 크기의 최소 높이와 여백을 rem 규격으로 적용한다',
    (size, minHeight, padding, borderRadius, gap) => {
      render(<Button size={size}>길찾기</Button>);
      const button = screen.getByRole('button', { name: '길찾기' });

      expect(button).toHaveStyle({ minHeight, padding, borderRadius, gap });
      expect(button.style.height).toBe('');
    },
  );

  it('외부 className을 합쳐 배치 스타일을 유지한다', () => {
    render(
      <Button
        className={css`
          width: 100%;
          min-height: 48px;
        `}
      >
        길찾기
      </Button>,
    );

    expect(screen.getByRole('button', { name: '길찾기' })).toHaveStyle({
      width: '100%',
      minHeight: '48px',
      whiteSpace: 'nowrap',
    });
  });

  it('아이콘을 전달해도 클릭 동작을 유지한다', async () => {
    const onClick = jest.fn();
    render(
      <Button icon={icon} onClick={onClick}>
        길찾기
      </Button>,
    );

    await userEvent.setup().click(screen.getByRole('button', { name: '길찾기' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('로딩 중에는 아이콘 대신 기존 처리 중 문구를 표시하고 클릭을 차단한다', async () => {
    const onClick = jest.fn();
    render(
      <Button icon={icon} isLoading onClick={onClick}>
        길찾기
      </Button>,
    );
    const button = screen.getByRole('button', { name: '처리 중…' });

    expect(button.querySelector('svg')).toBeNull();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('길찾기·로드뷰의 아이콘, 색상, 기존 스타일과 핸들러를 유지한다', async () => {
    const onDirections = jest.fn();
    const onRoadView = jest.fn();
    renderWithProviders(
      <ParkingDetailActions
        parkingLotId={101}
        likeCount={12}
        likedByMe={false}
        onDirections={onDirections}
        onRoadView={onRoadView}
      />,
    );
    const directions = screen.getByRole('button', { name: '길찾기 시작' });
    const roadView = screen.getByRole('button', { name: '로드뷰 보기' });

    expect(directions.querySelector('span[aria-hidden="true"] > svg')).toBeInTheDocument();
    expect(roadView.querySelector('span[aria-hidden="true"] > svg')).toBeInTheDocument();
    expect(directions).toHaveStyle({ background: color.background.brand, minHeight: '3rem' });
    expect(roadView).toHaveStyle({ background: color.background.brandSubtle, minHeight: '3rem' });
    const directionsIcon = directions.querySelector('svg')!;
    expect(getComputedStyle(directionsIcon).stroke || directionsIcon.getAttribute('stroke')).toBe(
      'currentColor',
    );

    const user = userEvent.setup();
    await user.click(directions);
    await user.click(roadView);
    expect(onDirections).toHaveBeenCalledTimes(1);
    expect(onRoadView).toHaveBeenCalledTimes(1);
  });

  it('상세 버튼의 높이, 여백, 모서리와 글꼴을 유지한다', () => {
    renderWithProviders(
      <ParkingDetailActions
        parkingLotId={101}
        likeCount={12}
        likedByMe={false}
        onDirections={jest.fn()}
        onRoadView={jest.fn()}
      />,
    );

    for (const name of ['길찾기 시작', '로드뷰 보기']) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveStyle({
        minHeight: '3rem',
        fontSize: '0.875rem',
        fontWeight: '700',
        lineHeight: '1.4',
      });
      const style = getComputedStyle(button);
      const pixels = (value: string) => parseFloat(value) * (value.endsWith('rem') ? 16 : 1);
      expect(pixels(style.paddingTop)).toBe(0);
      expect(pixels(style.paddingBottom)).toBe(0);
      expect(pixels(style.paddingLeft)).toBe(4);
      expect(pixels(style.paddingRight)).toBe(4);
      expect(pixels(style.borderRadius)).toBe(12);
      expect(pixels(style.gap)).toBe(4);
    }
  });
});
