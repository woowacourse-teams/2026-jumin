import { css } from '@emotion/css';
import type { ParkingLikeState } from '../../../../api/contracts';
import { useParkingLike } from '../../../hooks/useParkingLike';
import { color } from '../../../../src/theme/color';
import { typography } from '../../../../src/theme/typography';
import { Button } from '../../ui/Button';

interface Props extends ParkingLikeState {
  parkingLotId: number;
}

export const ParkingLikeButton = ({ parkingLotId, likeCount, likedByMe }: Props) => {
  const like = useParkingLike(parkingLotId, { likeCount, likedByMe });

  return (
    <div className={containerStyle}>
      <Button
        variant="rose"
        className={buttonStyle}
        aria-label={`좋아요 ${like.likeCount.toLocaleString('ko-KR')}개`}
        aria-pressed={like.likedByMe}
        onClick={like.toggle}
        icon={
          <svg
            viewBox="0 0 24 24"
            fill={like.likedByMe ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
        }
      >
        {like.likeCount.toLocaleString('ko-KR')}
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
