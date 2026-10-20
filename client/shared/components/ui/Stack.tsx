import { css, cx } from '@emotion/css';

import { Row, type Props } from './Row';

/**
 * Row의 배치 방향만 세로로 바꾼 컴포넌트.
 * align은 가로 정렬, justify는 세로 정렬을 지정합니다.
 * 기본 태그는 div이며, as로 section·dl 등 다른 태그를 지정할 수 있습니다.
 * 정렬·간격의 기본값과 공통 HTML 속성·ref 전달은 Row와 같습니다.
 *
 * @example
 * <Stack as="section" align="start" gap={16}>
 *   <h2>주차장 정보</h2>
 *   <p>운영시간을 확인하세요.</p>
 * </Stack>
 */
export const Stack = ({ className, ...props }: Props) => (
  <Row {...props} className={cx(stackStyle, className)} />
);

const stackStyle = css`
  flex-direction: column;
`;
