import { css } from '@emotion/css';
import type { ParkingViewportFilters } from '../../../../api/parkingLots';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';

interface Props {
  filters: ParkingViewportFilters;
  onChange: (filters: ParkingViewportFilters) => void;
}

type FilterKey = keyof ParkingViewportFilters;

const filterOptions: Array<{
  key: FilterKey;
  label: string;
  icon: string;
  color: string;
}> = [
  { key: 'freeOnly', label: '무료 주차장', icon: '$', color: color.parkingFilter.freeOnly },
  {
    key: 'excludeMechanical',
    label: '기계식 제외',
    icon: '▤',
    color: color.parkingFilter.excludeMechanical,
  },
];

export const ParkingFilterBar = ({ filters, onChange }: Props) => {
  // 칩 상태와 서버 요청 조건을 같은 값으로 토글한다.
  const toggleFilter = (key: FilterKey) => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  return (
    <div className={filterBarStyle} role="group" aria-label="주차장 필터">
      {filterOptions.map(({ key, label, icon, color: accentColor }) => {
        const isSelected = filters[key];

        return (
          <button
            key={key}
            className={filterButtonStyle(isSelected, accentColor)}
            type="button"
            aria-pressed={isSelected}
            onClick={() => toggleFilter(key)}
          >
            <span className={filterIconStyle(accentColor, isSelected)} aria-hidden="true">
              {icon}
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

  width: min(358px, calc(100% - 32px));
  margin: 10px auto 0;
  padding: 4px 4px 8px;
  box-sizing: border-box;

  overflow-x: auto;
  pointer-events: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const filterButtonStyle = (isSelected: boolean, accentColor: string) => css`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;

  min-height: 38px;
  padding: 0 16px;

  ${typography.label};
  color: ${isSelected ? color.text.inverse : color.text.primary};
  white-space: nowrap;

  background: ${isSelected ? accentColor : color.background.default};
  border: 1px solid ${isSelected ? accentColor : color.border.default};
  border-radius: 26px;

  box-shadow: ${
    isSelected ? '0 4px 10px rgba(16, 27, 55, 0.2)' : '0 2px 8px rgba(16, 27, 55, 0.12)'
  };

  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
    outline-offset: 2px;
  }
`;

const filterIconStyle = (accentColor: string, isSelected: boolean) => css`
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 22px;
  height: 22px;

  color: ${isSelected ? accentColor : color.icon.inverse};
  ${typography.label};

  background: ${isSelected ? color.background.default : accentColor};
  border-radius: 50%;
`;
