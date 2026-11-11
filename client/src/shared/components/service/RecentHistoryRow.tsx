import { Stack } from '../ui/Stack';
import { Row } from '../ui/Row';
import { css } from '@emotion/css';
import { color } from '../../../theme/color';
import { CloseIcon, HistoryIcon } from '../ui/icons';
import { typography } from '../../../theme/typography';

interface Props {
  title: string;
  address: string;
  metadata?: string;
  onSelect: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}

export const RecentHistoryRow = ({
  title,
  address,
  metadata,
  onSelect,
  onRemove,
  removeLabel,
}: Props) => (
  <Row as="li" align="center" className={rowStyle}>
    <button className={contentButtonStyle} type="button" onClick={onSelect}>
      <span className={historyIconStyle} aria-hidden="true">
        <HistoryIcon size={18} />
      </span>

      <Stack as="span" gap={3} className={textContainerStyle}>
        <strong className={titleStyle}>{title}</strong>
        <span className={addressStyle}>{address}</span>
        {metadata && <span className={metadataStyle}>{metadata}</span>}
      </Stack>
    </button>

    {onRemove && (
      <button
        className={removeButtonStyle}
        type="button"
        aria-label={removeLabel ?? `${title} 삭제`}
        onClick={onRemove}
      >
        <CloseIcon size={20} aria-hidden="true" />
      </button>
    )}
  </Row>
);

const rowStyle = css`
  min-height: 66px;

  border-bottom: 1px solid ${color.border.default};
`;

const contentButtonStyle = css`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;

  min-width: 0;
  padding: 14px 0 14px 20px;

  text-align: left;

  background: transparent;
  border: 0;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover,
  &:focus-visible {
    background: ${color.background.subtle};
  }
`;

const historyIconStyle = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  flex-shrink: 0;

  color: ${color.icon.default};
`;

const textContainerStyle = css`
  min-width: 0;
`;

const titleStyle = css`
  overflow: hidden;

  ${typography.bodySmallStrong};
  color: ${color.text.primary};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const addressStyle = css`
  overflow: hidden;

  ${typography.caption};
  color: ${color.text.secondary};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const metadataStyle = css`
  margin-top: 4px;

  ${typography.caption};
  color: ${color.text.secondary};
`;

const removeButtonStyle = css`
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-right: 6px;
  flex-shrink: 0;

  color: ${color.icon.default};

  background: transparent;
  border: 0;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
`;
