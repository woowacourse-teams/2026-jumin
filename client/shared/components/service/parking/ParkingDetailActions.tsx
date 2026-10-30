import { css } from '@emotion/css';
import type { ParkingLikeState } from '../../../../api/contracts';
import { color } from '../../../../src/theme/color';
import { Button } from '../../ui/Button';
import { DirectionsIcon, RoadViewIcon } from '../../ui/icons';
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
      icon={<DirectionsIcon size={18} aria-hidden="true" />}
    >
      길찾기
    </Button>
    <Button
      variant="subtle"
      aria-label="로드뷰 보기"
      onClick={onRoadView}
      icon={<RoadViewIcon size={18} aria-hidden="true" />}
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
  margin: 4px 0px 16px 0px;
  padding-bottom: 14px;
  border-bottom: 1px solid ${color.border.default};
`;
