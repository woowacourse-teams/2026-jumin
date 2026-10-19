import { css } from '@emotion/css';
import type { ParkingLikeState } from '../../../../api/contracts';
import { color } from '../../../../src/theme/color';
import { Button } from '../../ui/Button';
import { ParkingLikeButton } from './ParkingLikeButton';

interface Props extends ParkingLikeState {
  parkingLotId: number;
  onDirections: () => void;
  onRoadView: () => void;
}

export const ParkingDetailActions = ({
  parkingLotId,
  likeCount,
  likedByMe,
  onDirections,
  onRoadView,
}: Props) => (
  <section className={actionsStyle} aria-label="주차장 빠른 메뉴">
    <Button
      variant="brand"
      aria-label="길찾기 시작"
      onClick={onDirections}
      icon={
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m3 10 18-7-7 18-4-7-7-4Z" />
        </svg>
      }
    >
      길찾기
    </Button>
    <Button
      variant="subtle"
      aria-label="로드뷰 보기"
      onClick={onRoadView}
      icon={
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6h4l2-2h4l2 2h4v14H4Z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      }
    >
      로드뷰
    </Button>
    <ParkingLikeButton
      key={parkingLotId}
      parkingLotId={parkingLotId}
      likeCount={likeCount}
      likedByMe={likedByMe}
    />
  </section>
);

const actionsStyle = css`
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr));
  flex-shrink: 0;
  align-items: start;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid ${color.border.default};
`;
