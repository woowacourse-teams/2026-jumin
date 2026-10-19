import { css } from '@emotion/css';
import backIcon from '../../../assets/icons/backIcon.svg';
import { useNavigate } from 'react-router';
import type { ReactNode } from 'react';
import { color } from '../../../src/theme/color';
import { typography } from '../../../src/theme/typography';

interface Props {
  title: string;
  description?: string;
  onBack: () => void;
  action?: ReactNode;
}

export const ConditionBar = ({ title, description, onBack, action }: Props) => {
  const navigate = useNavigate(); // 뒤로가기 기능을 위한 navigate
  const handleBack = onBack ?? (() => navigate(-1));
  return (
    <header className={headerStyle} aria-label="검색 조건">
      <button
        className={backButtonStyle}
        type="button"
        aria-label="이전 화면으로 이동"
        onClick={handleBack}
      >
        <img className={backIconStyle} src={backIcon} alt="" draggable={false} />
      </button>

      <div className={conditionStyle}>
        <h1 className={destinationStyle}>{title}</h1>

        {(description || action) && (
          <div className={descriptionRowStyle}>
            {description && <p className={descriptionStyle}>{description}</p>}
            {action && <div className={actionStyle}>{action}</div>}
          </div>
        )}
      </div>
    </header>
  );
};

const headerStyle = css`
  position: absolute;
  top: calc(16px + env(safe-area-inset-top, 0px));
  right: 16px;
  left: 16px;
  z-index: 10;
  pointer-events: auto;

  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;

  min-height: 52px;
  padding: 16px 22px;

  background: ${color.background.default};
  border-radius: 24px;
  box-shadow: 0 8px 24px rgb(16 27 55 / 10%);
`;

const backButtonStyle = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 32px;
  height: 40px;
  padding: 0;

  background: transparent;
  border: 0;
  border-radius: 10px;
  cursor: pointer;

  &:hover {
    background: ${color.background.subtle};
  }

  &:focus-visible {
    outline: 2px solid ${color.border.focused};
    outline-offset: 2px;
  }
`;

const backIconStyle = css`
  width: 8px;
  height: 16px;

  pointer-events: none;
  user-select: none;
`;

const conditionStyle = css`
  min-width: 0;
`;

const destinationStyle = css`
  margin: 0;
  overflow: hidden;

  ${typography.titleCard};
  color: ${color.text.primary};
  letter-spacing: -0.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const descriptionStyle = css`
  min-width: 0;
  margin: 0;

  ${typography.body};
  color: ${color.text.secondary};
`;

const descriptionRowStyle = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  margin-top: 2px;
`;

const actionStyle = css`
  flex-shrink: 0;
  margin-left: auto;
`;
