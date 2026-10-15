import { css } from '@emotion/css';
import type { ParkingLikeState } from '../../api/contracts';
import { useParkingLike } from '../hooks/useParkingLike';

interface Props extends ParkingLikeState {
  parkingLotId: number;
}

export const ParkingLikeButton = ({ parkingLotId, likeCount, likedByMe }: Props) => {
  const like = useParkingLike(parkingLotId, { likeCount, likedByMe });

  return (
    <div className={containerStyle}>
      <button
        type="button"
        className={buttonStyle}
        aria-label={`좋아요 ${like.likeCount.toLocaleString('ko-KR')}개`}
        aria-pressed={like.likedByMe}
        aria-busy={like.isPending}
        disabled={like.isPending}
        onClick={like.toggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
        <span>{like.likeCount.toLocaleString('ko-KR')}</span>
      </button>
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
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 48px;
  padding: 0 4px;
  color: #c92a5c;
  font-family: inherit;
  font-size: 14px;
  font-weight: 800;
  background: #fff0f5;
  border: 1px solid #ffc9dc;
  border-radius: 12px;
  cursor: pointer;
  overflow-wrap: anywhere;

  &:hover:not(:disabled) {
    background: #ffe3ed;
  }

  svg {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &[aria-pressed='true'] {
    color: #fff;
    background: #c92a5c;
    border-color: #c92a5c;

    &:hover:not(:disabled) {
      background: #b42351;
    }

    svg {
      fill: currentColor;
    }
  }

  &:focus-visible {
    outline: 3px solid rgb(201 42 92 / 30%);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: wait;
    opacity: 0.7;
  }
`;

const errorStyle = css`
  margin: 8px 0 0;
  color: #c02b3c;
  font-size: 12px;
  line-height: 1.5;
`;
