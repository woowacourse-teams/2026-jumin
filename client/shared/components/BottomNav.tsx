import styled from '@emotion/styled';
import { NavLink } from 'react-router';
import activeHomeIcon from '../../assets/icons/activeHome.svg';
import activeNearbyIcon from '../../assets/icons/activeNearBy.svg';
import activeRecentUseIcon from '../../assets/icons/activeRecentUse.svg';
import homeIcon from '../../assets/icons/home.svg';
import nearbyIcon from '../../assets/icons/nearby.svg';
import recentUseIcon from '../../assets/icons/recentUse.svg';

const menus = [
  {
    path: '/nearby',
    label: '주변',
    icon: nearbyIcon,
    activeIcon: activeNearbyIcon,
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

export default function BottomNav() {
  return (
    <NavContainer aria-label="하단 메뉴">
      {menus.map(({ path, label, icon, activeIcon }) => (
        <NavItem key={path} to={path} end={path === '/'}>
          <NavIconWrapper>
            <NavIcon className="default-icon" src={icon} alt="" />
            <NavIcon className="active-icon" src={activeIcon} alt="" />
          </NavIconWrapper>

          <span>{label}</span>
        </NavItem>
      ))}
    </NavContainer>
  );
}

const NavContainer = styled.nav`
  display: grid;
  grid-template-columns: repeat(3, 1fr);

  width: 100%;
  height: 86px;
  background: white;
`;

const NavIconWrapper = styled.span`
  position: relative;
  width: 26px;
  height: 26px;
`;

const NavIcon = styled.img`
  position: absolute;
  inset: 0;
  width: 26px;
  height: 26px;

  &.active-icon {
    opacity: 0;
  }
`;

const NavItem = styled(NavLink)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;

  color: #8a94a2;
  font-size: 12px;
  text-decoration: none;

  &:hover,
  &:focus-visible,
  &.active {
    color: #155eef;

    .default-icon {
      opacity: 0;
    }

    .active-icon {
      opacity: 1;
    }
  }
`;
