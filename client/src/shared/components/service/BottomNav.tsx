import { css, cx } from '@emotion/css';
import { NavLink } from 'react-router';
import type { IconType } from 'react-icons';
import { HistoryIcon, HomeIcon, SettingsFilledIcon, SettingsIcon } from '../ui/icons';
import { color } from '../../../theme/color';
import { fontWeight } from '../../../theme/font';
import { duration, easing } from '../../../theme/motion';
import { typography } from '../../../theme/typography';

const menus = [
  {
    path: '/setting',
    label: '설정',
    icon: SettingsIcon,
    activeIcon: SettingsFilledIcon,
  },
  {
    path: '/',
    label: '홈',
    icon: HomeIcon,
    activeIcon: HomeIcon,
  },
  {
    path: '/recent',
    label: '최근 이용',
    icon: HistoryIcon,
    activeIcon: HistoryIcon,
  },
];

export const BottomNav = () => (
  <nav className={navigationStyle} aria-label="하단 메뉴">
    {menus.map(({ path, label, icon, activeIcon }) => (
      <NavLink className={navigationItemStyle} key={path} to={path} end={path === '/'}>
        <NavigationIcon icon={icon} activeIcon={activeIcon} />
        <span>{label}</span>
      </NavLink>
    ))}
  </nav>
);

interface NavigationIconProps {
  icon: IconType;
  activeIcon: IconType;
}

const NavigationIcon = ({ icon: Icon, activeIcon: ActiveIcon }: NavigationIconProps) => (
  <span className={iconContainerStyle}>
    <Icon className={cx('default-icon', iconStyle)} size={26} aria-hidden="true" />
    <ActiveIcon
      className={cx('active-icon', iconStyle, activeIconStyle)}
      size={26}
      aria-hidden="true"
    />
  </span>
);

const navigationStyle = css`
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;

  display: grid;
  grid-template-columns: repeat(3, 1fr);

  width: 100%;
  height: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);

  background: ${color.background.default};
  box-shadow: 0 -1px 0 ${color.border.default};
`;

const navigationItemStyle = css`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;

  padding: 0;

  font: inherit;
  ${typography.caption};
  color: ${color.text.secondary};
  text-decoration: none;

  background: transparent;
  border: 0;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  /* 현재 화면을 가리키는 표시선. 선택되지 않은 항목에서는 너비 0으로 접어 둔다. */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    width: 28px;
    height: 3px;
    background: ${color.background.selected};
    border-radius: 0 0 3px 3px;
    transform: translateX(-50%) scaleX(0);
    transition: transform ${duration.base} ${easing.out};
  }

  &.active {
    font-weight: ${fontWeight[600]};

    &::before {
      transform: translateX(-50%) scaleX(1);
    }
  }

  &:focus-visible,
  &.active {
    color: ${color.text.selected};

    .default-icon {
      opacity: 0;
    }

    .active-icon {
      opacity: 1;
    }
  }

  @media (hover: hover) {
    &:hover {
      color: ${color.text.selected};

      .default-icon {
        opacity: 0;
      }

      .active-icon {
        opacity: 1;
      }
    }
  }
`;

const iconContainerStyle = css`
  position: relative;

  width: 26px;
  height: 26px;
`;

const iconStyle = css`
  position: absolute;
  inset: 0;

  width: 26px;
  height: 26px;
  color: ${color.icon.default};

  pointer-events: none;
  user-select: none;
`;

const activeIconStyle = css`
  opacity: 0;
  color: ${color.icon.selected};
`;
