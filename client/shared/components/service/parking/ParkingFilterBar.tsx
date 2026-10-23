import { css, cx } from '@emotion/css';
import type { IconType } from 'react-icons';
import { FreeParkingIcon, MechanicalParkingIcon } from '../../ui/icons';
import type { ParkingFilters } from '../../../types/parkingFilters';
import { color } from '../../../../src/theme/color';
import { typography } from '../../../../src/theme/typography';

interface Props {
  filters: ParkingFilters;
  onChange: (filters: ParkingFilters) => void;
  /** 화면별 너비·여백 등 배치 스타일. */
  className?: string;
}

type FilterKey = keyof ParkingFilters;

const filterOptions: Array<{
  key: FilterKey;
  label: string;
  icon: IconType;
  iconColor: string;
}> = [
  {
    key: 'freeOnly',
    label: '무료 주차장',
    icon: FreeParkingIcon,
    iconColor: color.parkingFilter.freeOnly.icon,
  },
  {
    key: 'excludeMechanical',
    label: '기계식 제외',
    icon: MechanicalParkingIcon,
    iconColor: color.parkingFilter.excludeMechanical.icon,
  },
];

/** 필터 조건을 표시하고 변경을 알린다. 상태 보관과 조회는 사용하는 화면이 담당한다. */
export const ParkingFilterBar = ({ filters, onChange, className }: Props) => {
  const toggleFilter = (key: FilterKey) => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  return (
    <div className={cx(filterBarStyle, className)} role="group" aria-label="주차장 필터">
      {filterOptions.map(({ key, label, icon: Icon, iconColor }) => {
        const isSelected = filters[key];

        return (
          <button
            key={key}
            className={filterButtonStyle(isSelected)}
            type="button"
            aria-pressed={isSelected}
            onClick={() => toggleFilter(key)}
          >
            <span className={filterIconStyle(iconColor)} aria-hidden="true">
              <Icon size={22} />
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
};

const filterBarStyle = css`
  display: flex;
  gap: 8px;

  min-width: 0;
  padding: 4px 4px 8px;
  box-sizing: border-box;

  overflow-x: auto;
  pointer-events: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const filterButtonStyle = (isSelected: boolean) => css`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;

  min-height: 38px;
  padding: 0 16px;

  ${typography.label};
  color: ${isSelected ? color.text.selected : color.text.primary};
  white-space: nowrap;

  background: ${isSelected ? color.background.selectedSubtle : color.background.default};
  border: 1px solid ${isSelected ? color.border.selected : color.border.default};
  border-radius: 26px;

  box-shadow: ${
    isSelected ? '0 4px 10px rgba(16, 27, 55, 0.2)' : '0 2px 8px rgba(16, 27, 55, 0.12)'
  };

  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover,
  &:active {
    background: ${isSelected ? color.background.brandSubtleHovered : color.background.subtle};
  }

  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
    outline-offset: 2px;
  }
`;

const filterIconStyle = (iconColor: string) => css`
  display: inline-flex;
  align-items: center;
  justify-content: center;

  color: ${iconColor};
  ${typography.label};

  background: transparent;
  border-radius: 50%;
`;
