import { css, cx } from '@emotion/css';
import { NavLink } from 'react-router';
import activeHomeIcon from '../../assets/icons/activeHome.svg';
import activeSettingIcon from '../../assets/icons/activeSetting.svg';
import activeRecentUseIcon from '../../assets/icons/activeRecentUse.svg';
import homeIcon from '../../assets/icons/home.svg';
import settingIcon from '../../assets/icons/setting.svg';
import recentUseIcon from '../../assets/icons/recentUse.svg';

const menus = [
  {
    path: '/setting',
    label: '설정',
    icon: settingIcon,
    activeIcon: activeSettingIcon,
  },
  {
    path: '/',
    label: '홈',
    icon: homeIcon,
    activeIcon: activeHomeIcon,
  },
  {
    path: '/recent',
    label: '최근 이용',
    icon: recentUseIcon,
    activeIcon: activeRecentUseIcon,
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
  icon: string;
  activeIcon: string;
}

const NavigationIcon = ({ icon, activeIcon }: NavigationIconProps) => (
  <span className={iconContainerStyle}>
    <img className={cx('default-icon', iconStyle)} src={icon} alt="" draggable={false} />
    <img
      className={cx('active-icon', iconStyle, activeIconStyle)}
      src={activeIcon}
      alt=""
      draggable={false}
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

  background: white;
`;

const navigationItemStyle = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;

  padding: 0;

  color: #8a94a2;
  font: inherit;
  font-size: 12px;
  text-decoration: none;

  background: transparent;
  border: 0;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover,
  &:focus-visible,
  &.active {
    color: #4356d8;

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

  pointer-events: none;
  user-select: none;
`;

const activeIconStyle = css`
  opacity: 0;
`;
