import { css, cx, keyframes } from '@emotion/css';

import { color } from '../../../theme/color';

const FEE_RULE_COUNT = 3;
const DETAIL_ROW_COUNT = 3;

export const ParkingDetailSkeleton = () => (
  <section
    className={sheetStyle}
    aria-label="주차장 상세정보를 불러오는 중"
    aria-busy="true"
    role="status"
  >
    <div className={contentStyle} aria-hidden="true">
      <div className={feeCardStyle}>
        <div className={totalFeeStyle}>
          <div className={cx(skeletonBlockStyle, totalFeeLabelStyle)} />
          <div className={cx(skeletonBlockStyle, totalFeeValueStyle)} />
        </div>

        <div className={feeRuleListStyle}>
          {Array.from({ length: FEE_RULE_COUNT }, (_, index) => (
            <div className={feeRuleStyle} key={index}>
              <div className={cx(skeletonBlockStyle, feeRuleLabelStyle)} />
              <div className={cx(skeletonBlockStyle, feeRuleValueStyle)} />
            </div>
          ))}
        </div>
      </div>

      <div className={detailsStyle}>
        {Array.from({ length: DETAIL_ROW_COUNT }, (_, index) => (
          <div className={detailRowStyle} key={index}>
            <div className={cx(skeletonBlockStyle, detailLabelStyle)} />
            <div className={cx(skeletonBlockStyle, detailValueStyle)} />
          </div>
        ))}
      </div>

      <div className={footerStyle}>
        <div className={cx(skeletonBlockStyle, sourceStyle)} />
        <div className={cx(skeletonBlockStyle, navigationButtonStyle)} />
      </div>
    </div>
  </section>
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

const sheetStyle = css`
  display: flex;
  height: 100%;
  flex-direction: column;
  pointer-events: none;

  background: ${color.background.default};
`;

const contentStyle = css`
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
`;

const feeCardStyle = css`
  overflow: hidden;

  border: 1px solid ${color.border.default};
  border-radius: 18px;
`;

const totalFeeStyle = css`
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;

  background: ${color.background.brandSubtle};
`;

const totalFeeLabelStyle = css`
  width: 112px;
  height: 18px;
  border-radius: 6px;
`;

const totalFeeValueStyle = css`
  width: 74px;
  height: 20px;
  border-radius: 6px;
`;

const feeRuleListStyle = css`
  display: grid;
  gap: 18px;
  padding: 20px 18px;
`;

const feeRuleStyle = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const feeRuleLabelStyle = css`
  width: 96px;
  height: 16px;
  border-radius: 6px;
`;

const feeRuleValueStyle = css`
  width: 58px;
  height: 16px;
  border-radius: 6px;
`;

const detailsStyle = css`
  display: grid;
  gap: 12px;
  margin-top: 44px;
`;

const detailRowStyle = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const detailLabelStyle = css`
  width: 54px;
  height: 16px;
  border-radius: 6px;
`;

const detailValueStyle = css`
  width: 116px;
  height: 16px;
  border-radius: 6px;
`;

const footerStyle = css`
  margin-top: auto;
`;

const sourceStyle = css`
  width: 148px;
  height: 13px;
  margin: 24px 0 18px;
  border-radius: 5px;
`;

const navigationButtonStyle = css`
  width: 100%;
  min-height: 54px;
  border-radius: 14px;
`;
