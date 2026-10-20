import { css, cx } from '@emotion/css';
import type { ComponentProps } from 'react';

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

export interface Props extends ComponentProps<'div'> {
  /**
   * Row의 세로·Stack의 가로 정렬을 지정한다. 기본값은 stretch로 적용된다.
   * @default "stretch"
   */
  align?: keyof typeof ALIGN;

  /**
   * Row의 가로·Stack의 세로 정렬을 지정한다. 기본값은 start로 적용된다.
   * @default "flex-start"
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
 * 기본 div 속성과 ref를 전달한다.
 *
 * @example
 * <Row align="center" justify="between" gap={16}>
 *   <span>기본요금</span>
 *   <strong>3,000원</strong>
 * </Row>
 */
export const Row = ({
  align = 'stretch',
  justify = 'start',
  gap = 0,
  className,
  ...props
}: Props) => <div {...props} className={cx(root(align, justify, gap), className)} />;
