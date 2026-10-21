import { css } from '@emotion/css';
import type { ParkingLikeState } from '../../../../api/contracts';
import { useParkingLike } from '../../../hooks/useParkingLike';
import { color } from '../../../../src/theme/color';
import { typography } from '../../../../src/theme/typography';
import { Button } from '../../ui/Button';
import { HeartFilledIcon, HeartIcon } from '../../ui/icons';

interface Props extends ParkingLikeState {
  parkingLotId: number;
}

export const ParkingLikeButton = ({ parkingLotId, likeCount, likedByMe }: Props) => {
  const like = useParkingLike(parkingLotId, { likeCount, likedByMe });
  const LikeIcon = like.likedByMe ? HeartFilledIcon : HeartIcon;

  return (
    <div className={containerStyle}>
      <Button
        variant="rose"
        className={buttonStyle}
        aria-label={`좋아요 ${like.likeCount.toLocaleString('ko-KR')}개`}
        aria-pressed={like.likedByMe}
        onClick={like.toggle}
        icon={<LikeIcon size={18} aria-hidden="true" />}
      >
        <span>{like.likeCount.toLocaleString('ko-KR')}</span>
      </Button>
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

const buttonStyle = css`
  width: 100%;
`;

const errorStyle = css`
  margin: 8px 0 0;
  ${typography.caption};
  color: ${color.text.error};
`;
