import { css } from '@emotion/css';
import type { ParkingLikeState } from '../../../../api/contracts';
import { useParkingLike } from '../../../hooks/useParkingLike';
import { color } from '../../../../src/theme/color';
import { typography } from '../../../../src/theme/typography';
import { ToggleButton } from '../../ui/ToggleButton';
import { HeartFilledIcon, HeartIcon } from '../../ui/icons';

interface Props extends ParkingLikeState {
  parkingLotId: number;
}

export const ParkingLikeButton = ({ parkingLotId, likeCount, likedByMe }: Props) => {
  const like = useParkingLike(parkingLotId, { likeCount, likedByMe });
  const LikeIcon = like.likedByMe ? HeartFilledIcon : HeartIcon;

  return (
    <div className={containerStyle}>
      <ToggleButton
        variant="outline"
        className={like.likedByMe ? selectedButtonStyle : undefined}
        aria-label={`좋아요 ${like.likeCount.toLocaleString('ko-KR')}개`}
        pressed={like.likedByMe}
        onPressedChange={like.toggle}
        icon={<LikeIcon size={18} aria-hidden="true" />}
        isFullWidth={true}
      >
        <span>{like.likeCount.toLocaleString('ko-KR')}</span>
      </ToggleButton>
      {like.errorMessage && (
        <p role="alert" className={errorStyle}>
          {like.errorMessage}
        </p>
      )}
    </div>
  );
};

const containerStyle = css`
  min-width: 0;
`;

const selectedButtonStyle = css`
  background-color: ${color.background.default};
  color: ${color.parkingLike.selected};
  box-shadow: inset 0 0 0 1px ${color.parkingLike.selected};

  &:hover:not(:disabled),
  &:active:not(:disabled) {
    background-color: ${color.background.subtle};
  }
`;

const errorStyle = css`
  margin: 8px 0 0;
  ${typography.caption};
  color: ${color.text.error};
`;
