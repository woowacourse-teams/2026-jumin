import { css, cx } from '@emotion/css';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import activeHomeIcon from '../../assets/icons/activeHome.svg';
import activeNearbyIcon from '../../assets/icons/activeNearBy.svg';
import activeRecentUseIcon from '../../assets/icons/activeRecentUse.svg';
import homeIcon from '../../assets/icons/home.svg';
import nearbyIcon from '../../assets/icons/nearby.svg';
import recentUseIcon from '../../assets/icons/recentUse.svg';

const menus = [
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

export const BottomNav = () => {
  const navigate = useNavigate();
  const [isLocating, setIsLocating] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const handleNearbyClick = () => {
    if (!navigator.geolocation) {
      window.alert('현재 위치를 지원하지 않는 브라우저예요.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!isMountedRef.current) return;

        setIsLocating(false);
        navigate('/parkingsetup', {
          state: {
            destination: {
              name: '현재 위치',
              latitude: coords.latitude,
              longitude: coords.longitude,
            },
          },
        });
      },
      () => {
        if (!isMountedRef.current) return;

        setIsLocating(false);
        window.alert('현재 위치를 가져오지 못했어요. 위치 권한을 확인해 주세요.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return (
    <nav className={navigationStyle} aria-label="하단 메뉴">
      <button
        className={navigationItemStyle}
        type="button"
        disabled={isLocating}
        onClick={handleNearbyClick}
      >
        <NavigationIcon icon={nearbyIcon} activeIcon={activeNearbyIcon} />
        <span>{isLocating ? '위치 확인 중' : '주변'}</span>
      </button>

      {menus.map(({ path, label, icon, activeIcon }) => (
        <NavLink className={navigationItemStyle} key={path} to={path} end={path === '/'}>
          <NavigationIcon icon={icon} activeIcon={activeIcon} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

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
  height: calc(86px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);

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

  &:disabled {
    cursor: wait;
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
