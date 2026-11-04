import { css, cx } from '@emotion/css';
import type { IconType } from 'react-icons';
import { FreeParkingIcon, MechanicalParkingIcon, PublicParkingIcon } from '../../ui/icons';
import type { ParkingFilters } from '../../../types/parkingFilters';
import { color } from '../../../../theme/color';
import { Chip } from '../../ui/Chip';
import { Row } from '../../ui/Row';

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
  {
    key: 'isPublic',
    label: '공영 주차장',
    icon: PublicParkingIcon,
    iconColor: color.parkingFilter.isPublic.icon,
  },
];

/** 필터 조건을 표시하고 변경을 알린다. 상태 보관과 조회는 사용하는 화면이 담당한다. */
export const ParkingFilterBar = ({ filters, onChange, className }: Props) => {
  return (
    <Row gap={8} className={cx(filterBarStyle, className)} role="group" aria-label="주차장 필터">
      {filterOptions.map(({ key, label, icon: Icon, iconColor }) => {
        const isSelected = filters[key];

        return (
          <Chip
            key={key}
            selected={isSelected}
            onSelectedChange={(selected) => onChange({ ...filters, [key]: selected })}
            icon={<Icon color={iconColor} />}
          >
            {label}
          </Chip>
        );
      })}
    </Row>
  );
};

const filterBarStyle = css`
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
