import { css } from '@emotion/css';
import type { ParkingViewportFilters } from '../../../../api/parkingLots';

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
  { key: 'freeOnly', label: '무료 주차장', icon: '$', color: '#00ad78' },
  { key: 'excludeMechanical', label: '기계식 제외', icon: '▤', color: '#454545' },
];

export const ParkingFilterBar = ({ filters, onChange }: Props) => {
  // 칩 상태와 서버 요청 조건을 같은 값으로 토글한다.
  const toggleFilter = (key: FilterKey) => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  return (
    <div className={filterBarStyle} role="group" aria-label="주차장 필터">
      {filterOptions.map(({ key, label, icon, color }) => {
        const isSelected = filters[key];

        return (
          <button
            key={key}
            className={filterButtonStyle(isSelected, color)}
            type="button"
            aria-pressed={isSelected}
            onClick={() => toggleFilter(key)}
          >
            <span className={filterIconStyle(color, isSelected)} aria-hidden="true">
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

const filterButtonStyle = (isSelected: boolean, color: string) => css`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;

  min-height: 38px;
  padding: 0 16px;

  color: ${isSelected ? '#ffffff' : '#101b37'};
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;

  background: ${isSelected ? color : '#ffffff'};
  border: 1px solid ${isSelected ? color : '#e3e6ef'};
  border-radius: 26px;

  box-shadow: ${
    isSelected ? '0 4px 10px rgba(16, 27, 55, 0.2)' : '0 2px 8px rgba(16, 27, 55, 0.12)'
  };

  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 2px;
  }
`;

const filterIconStyle = (color: string, isSelected: boolean) => css`
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 22px;
  height: 22px;

  color: ${isSelected ? color : '#ffffff'};
  font-size: 14px;
  font-weight: 800;
  line-height: 1;

  background: ${isSelected ? '#ffffff' : color};
  border-radius: 50%;
`;
