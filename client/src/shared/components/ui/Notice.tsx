import { css, cx } from '@emotion/css';
import { color } from '../../../theme/color';
import { radius } from '../../../theme/radius';
import { shadow } from '../../../theme/shadow';
import { typography } from '../../../theme/typography';

const NOTICE = {
  padding: '10px 16px',
  radius: radius.pill,
  background: color.background.floating,
  shadow: shadow.floating,
} as const;

interface Props {
  children: string;
  /** 위치·너비·바깥 여백은 사용처에서 지정한다. */
  className?: string;
}

/** 화면의 짧은 안내를 표시하고 변경된 내용을 보조 기기에 알린다. */
export const Notice = ({ children, className }: Props) => (
  <p className={cx(root, className)} role="status" aria-live="polite">
    {children}
  </p>
);

const root = css`
  margin: 0;
  padding: ${NOTICE.padding};
  ${typography.label};
  color: ${color.text.primary};
  text-align: center;
  word-break: keep-all;
  background: ${NOTICE.background};
  border-radius: ${NOTICE.radius};
  box-shadow: ${NOTICE.shadow};
`;
