import { css } from '@emotion/css';
import { Link } from 'react-router';

import nearbyIcon from '../../../../assets/icons/nearby.svg';
import recentUseIcon from '../../../../assets/icons/recentUse.svg';
import { useNearbyParkingNavigation } from '../../../../shared/hooks/useNearbyParkingNavigation';

export const HomeQuickNav = () => {
  const { isLocating, navigateToNearbyParking } = useNearbyParkingNavigation();

  return (
    <section className={containerStyle} aria-label="빠른 메뉴">
      <button
        className={actionStyle}
        type="button"
        disabled={isLocating}
        onClick={navigateToNearbyParking}
      >
        <img className={iconStyle} src={nearbyIcon} alt="" draggable={false} />

        <span>{isLocating ? '위치 확인 중' : '내 주변 주차장'}</span>
      </button>

      <Link className={actionStyle} to="/recent">
        <img className={iconStyle} src={recentUseIcon} alt="" draggable={false} />

        <span>최근 이용</span>
      </Link>
    </section>
  );
};

const containerStyle = css`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;

  width: 100%;
  margin-top: 24px;
`;

const actionStyle = css`
  display: flex;
  min-width: 0;
  min-height: 150px;
  padding: 24px 12px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;

  color: #697386;
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  text-decoration: none;

  background: #f0f2ff;
  border: 0;
  border-radius: 28px;
  box-shadow: 3px 3px 0 rgb(16 27 55 / 12%);
  cursor: pointer;

  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 100ms ease,
    background-color 150ms ease;

  &:hover {
    background: #e9ecff;
  }

  &:active {
    box-shadow: 0 3px 0 rgb(16 27 55 / 12%);
    transform: translateY(3px);
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 3px;
  }

  &:disabled {
    cursor: wait;
    opacity: 0.65;
  }
`;

const iconStyle = css`
  width: 56px;
  height: 56px;

  object-fit: contain;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
`;
