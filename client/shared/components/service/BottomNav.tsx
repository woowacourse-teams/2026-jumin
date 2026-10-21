import { css, cx } from '@emotion/css';
import { NavLink } from 'react-router';
import type { IconType } from 'react-icons';
import { HistoryIcon, HomeIcon, SettingsFilledIcon, SettingsIcon } from '../ui/icons';
import { color } from '../../../src/theme/color';
import { typography } from '../../../src/theme/typography';

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
`;

const navigationItemStyle = css`
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

  &:hover,
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
