import { css, cx, keyframes } from '@emotion/css';

import { BOTTOM_SHEET_HEIGHT } from '../../../../shared/components/BottomSheet';

const FEE_RULE_COUNT = 3;
const DETAIL_ROW_COUNT = 3;

export const ParkingDetailSkeleton = () => (
  <section
    className={sheetStyle}
    aria-label="주차장 상세정보를 불러오는 중"
    aria-busy="true"
    role="status"
  >
    <div className={handleAreaStyle} aria-hidden="true">
      <div className={handleStyle} />
    </div>

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
  background: linear-gradient(90deg, #e5e8f0 25%, #f7f8fb 50%, #e5e8f0 75%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.4s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const sheetStyle = css`
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1000;

  display: flex;
  height: ${BOTTOM_SHEET_HEIGHT}px;
  flex-direction: column;
  pointer-events: none;

  background: #ffffff;
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -4px 20px rgb(0 0 0 / 10%);
`;

const handleAreaStyle = css`
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  padding: 14px 0 18px;
`;

const handleStyle = css`
  width: 40px;
  height: 4px;

  background: #d9deeb;
  border-radius: 999px;
`;

const contentStyle = css`
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 0 24px max(28px, env(safe-area-inset-bottom));
`;

const feeCardStyle = css`
  overflow: hidden;

  border: 1px solid #dfe4ef;
  border-radius: 18px;
`;

const totalFeeStyle = css`
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;

  background: #f0f2ff;
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
