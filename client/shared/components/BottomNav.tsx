import { css } from '@emotion/css';
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

export const BottomNav = () => (
  <nav
    className={css`
      display: grid;
      grid-template-columns: repeat(3, 1fr);

      width: 100%;
      height: 86px;
      background: white;
    `}
    aria-label="하단 메뉴"
  >
    {menus.map(({ path, label, icon, activeIcon }) => (
      <NavLink
        className={css`
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
        `}
        key={path}
        to={path}
        end={path === '/'}
      >
        <span
          className={css`
            position: relative;
            width: 26px;
            height: 26px;
          `}
        >
          <img
            className={`default-icon ${css`
              position: absolute;
              inset: 0;
              width: 26px;
              height: 26px;
            `}`}
            src={icon}
            alt=""
          />
          <img
            className={`active-icon ${css`
              position: absolute;
              inset: 0;
              width: 26px;
              height: 26px;
              opacity: 0;
            `}`}
            src={activeIcon}
            alt=""
          />
        </span>

        <span>{label}</span>
      </NavLink>
    ))}
  </nav>
);
