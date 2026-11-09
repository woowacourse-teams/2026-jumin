import { Button } from '../ui/Button';
import { Stack } from '../ui/Stack';
import { css, cx } from '@emotion/css';

import brandMark from '../../../../assets/icons/brandMark.svg';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';
import { RetryIcon } from '../ui/icons';

interface Props {
  label: string;
  onRetry: () => void;
  className?: string;
}

export const ErrorCard = ({ label, onRetry, className }: Props) => (
  <Stack as="section" align="center" gap={20} className={cx(errorStyle, className)} role="alert">
    <img className={logoStyle} src={brandMark} alt="" draggable={false} />

    <Stack gap={6}>
      <h2 className={titleStyle}>{label}</h2>
      <p className={descriptionStyle}>네트워크 상태를 확인한 후 다시 시도해 주세요.</p>
    </Stack>

    <Button
      size="lg"
      isFullWidth
      icon={<RetryIcon size={22} aria-hidden="true" />}
      onClick={onRetry}
    >
      다시 시도
    </Button>
  </Stack>
);

const errorStyle = css`
  position: absolute;
  right: 16px;
  bottom: max(24px, env(safe-area-inset-bottom));
  left: 16px;
  z-index: 20;

  pointer-events: auto;

  padding: 28px 24px 24px;

  color: ${color.text.primary};
  text-align: center;

  background: rgb(255 255 255 / 96%);
  border: 1px solid rgb(67 86 216 / 12%);
  border-radius: 24px;
  box-shadow: 0 8px 24px rgb(16 27 55 / 14%);
  backdrop-filter: blur(8px);
`;

const logoStyle = css`
  width: 58px;
  height: 64px;

  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
`;

const titleStyle = css`
  margin: 0;

  ${typography.titleCard};
  letter-spacing: -0.6px;
`;

const descriptionStyle = css`
  margin: 0;

  ${typography.bodySmall};
  color: ${color.text.secondary};
`;
