import { css, cx } from '@emotion/css';
import type { ElementType, HTMLAttributes } from 'react';

const ALIGN = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

const JUSTIFY = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};

export interface Props extends HTMLAttributes<HTMLElement> {
  /** 렌더링할 태그 또는 컴포넌트. 생략하면 div를 사용한다. */
  as?: ElementType;

  /**
   * Row의 세로·Stack의 가로 정렬을 지정한다. 기본값은 stretch로 적용된다.
   * @default "stretch"
   */
  align?: keyof typeof ALIGN;

  /**
   * Row의 가로·Stack의 세로 정렬을 지정한다. 기본값은 start로 적용된다.
   * @default "start"
   */
  justify?: keyof typeof JUSTIFY;

  /**
   * 자식 사이 간격을 지정한다. 숫자는 px로 변환하고 문자열은 그대로 사용한다.
   * @default 0
   * */
  gap?: number | string;
}

const root = (
  align: NonNullable<Props['align']>,
  justify: NonNullable<Props['justify']>,
  gap: number | string,
) => css`
  display: flex;
  flex-direction: row;
  align-items: ${ALIGN[align]};
  justify-content: ${JUSTIFY[justify]};
  gap: ${typeof gap === 'number' ? `${gap}px` : gap};
`;

/**
 * 자식을 가로로 배치한다.
 * 정렬·간격을 관리한다.
 * 크기·여백·색상은 className·style로 지정한다.
 * 기본 태그는 div이며, as로 태그를 바꿀 수 있다.
 * 공통 HTML 속성과 ref를 전달하며, 태그별 전용 속성은 추론하지 않는다.
 * 커스텀 컴포넌트는 className과 전달받은 HTML 속성을 렌더링 요소에 연결해야 한다.
 *
 * @example
 * <Row align="center" justify="between" gap={16}>
 *   <span>기본요금</span>
 *   <strong>3,000원</strong>
 * </Row>
 */
export const Row = ({
  as: Component = 'div',
  align = 'stretch',
  justify = 'start',
  gap = 0,
  className,
  ...props
}: Props) => <Component {...props} className={cx(root(align, justify, gap), className)} />;
