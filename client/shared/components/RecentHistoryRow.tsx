import { css } from '@emotion/css';
import { color } from '../../src/theme/color';
import { fontSize } from '../../src/theme/font';
import { typography } from '../../src/theme/typography';

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
  <li className={rowStyle}>
    <button className={contentButtonStyle} type="button" onClick={onSelect}>
      <span className={historyIconStyle} aria-hidden="true">
        ◷
      </span>

      <span className={textContainerStyle}>
        <strong className={titleStyle}>{title}</strong>
        <span className={addressStyle}>{address}</span>
        {metadata && <span className={metadataStyle}>{metadata}</span>}
      </span>
    </button>

    {onRemove && (
      <button
        className={removeButtonStyle}
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
      >
        ×
      </button>
    )}
  </li>
);

const rowStyle = css`
  display: flex;
  align-items: center;

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
  width: 20px;
  flex-shrink: 0;

  color: ${color.icon.default};
  font-size: ${fontSize[18]};
  text-align: center;
`;

const textContainerStyle = css`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
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
  width: 44px;
  height: 44px;
  margin-right: 6px;
  flex-shrink: 0;

  color: ${color.icon.default};
  font-size: ${fontSize[20]};

  background: transparent;
  border: 0;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
`;
