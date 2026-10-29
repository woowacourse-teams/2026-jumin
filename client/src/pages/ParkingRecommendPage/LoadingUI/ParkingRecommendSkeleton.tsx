import { css, cx, keyframes } from '@emotion/css';
import { color } from '../../../theme/color';

const SKELETON_CARD_COUNT = 3;

export const ParkingRecommendSkeleton = () => (
  <div aria-label="추천 주차장을 불러오는 중" aria-busy="true" role="status">
    <section aria-hidden="true">
      <ul className={cardListStyle}>
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <li key={index}>
            <article className={cardStyle}>
              <div className={cx(skeletonBlockStyle, nameStyle)} />
              <div className={cx(skeletonBlockStyle, descriptionStyle)} />
              <div className={cx(skeletonBlockStyle, priceStyle)} />
              <div className={cx(skeletonBlockStyle, distanceStyle)} />
              <div className={cx(skeletonBlockStyle, buttonStyle)} />
            </article>
          </li>
        ))}
      </ul>
    </section>
  </div>
);

const shimmer = keyframes`
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
`;

const skeletonBlockStyle = css`
  background: linear-gradient(
    90deg,
    ${color.background.muted} 25%,
    ${color.background.subtle} 50%,
    ${color.background.muted} 75%
  );
  background-size: 200% 100%;
  animation: ${shimmer} 1.4s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const cardListStyle = css`
  display: flex;
  flex-direction: column;
  gap: 12px;

  margin: 0;
  padding: 0;

  list-style: none;
`;

const cardStyle = css`
  display: grid;
  grid-template-areas:
    'name name'
    'description description'
    'price button'
    'distance button';
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;

  width: 100%;
  min-height: 158px;
  padding: 16px 18px;

  background: ${color.background.default};
  border: 2px solid ${color.border.default};
  border-radius: 24px;
  box-shadow: 0 6px 18px rgb(16 27 55 / 12%);
`;

const nameStyle = css`
  grid-area: name;
  width: 160px;
  height: 22px;
  border-radius: 7px;
`;

const descriptionStyle = css`
  grid-area: description;
  width: 190px;
  height: 16px;
  margin: 4px 0 12px;
  border-radius: 6px;
`;

const priceStyle = css`
  grid-area: price;
  width: 100px;
  height: 26px;
  border-radius: 7px;
`;

const distanceStyle = css`
  grid-area: distance;
  width: 60px;
  height: 18px;
  margin-top: 2px;
  border-radius: 6px;
`;

const buttonStyle = css`
  grid-area: button;
  width: 90px;
  height: 56px;
  margin-left: 14px;
  border-radius: 16px;
`;
