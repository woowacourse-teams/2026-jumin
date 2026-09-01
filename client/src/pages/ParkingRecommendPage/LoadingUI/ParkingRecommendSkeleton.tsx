import { css, cx, keyframes } from '@emotion/css';

const CARD_WIDTH = 300;
const CARD_GAP = 12;
const SKELETON_CARD_COUNT = 2;

export const ParkingRecommendSkeleton = () => (
  <div aria-label="추천 주차장을 불러오는 중" aria-busy="true" role="status">
    <section className={recommendationSectionStyle} aria-hidden="true">
      <ul className={cardListStyle}>
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <li className={cardItemStyle} key={index}>
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

    <section className={collapsedBottomSheetStyle} aria-hidden="true">
      <div className={handleAreaStyle}>
        <div className={handleStyle} />
      </div>
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
  background: linear-gradient(90deg, #e5e8f0 25%, #f7f8fb 50%, #e5e8f0 75%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.4s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const recommendationSectionStyle = css`
  position: absolute;
  right: 0;
  bottom: 114px;
  left: 0;
  z-index: 5;

  overflow: hidden;
`;

const cardListStyle = css`
  display: flex;
  gap: ${CARD_GAP}px;

  margin: 0;
  padding: 0 calc((100% - ${CARD_WIDTH}px) / 2);

  list-style: none;
`;

const cardItemStyle = css`
  flex: 0 0 ${CARD_WIDTH}px;
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

  background: #ffffff;
  border: 2px solid #dfe3ef;
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

const collapsedBottomSheetStyle = css`
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1000;

  height: 100px;

  background: #ffffff;
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -4px 20px rgb(0 0 0 / 10%);
`;

const handleAreaStyle = css`
  display: flex;
  justify-content: center;
  padding: 14px 0 18px;
`;

const handleStyle = css`
  width: 40px;
  height: 4px;

  background: #d9deeb;
  border-radius: 999px;
`;
