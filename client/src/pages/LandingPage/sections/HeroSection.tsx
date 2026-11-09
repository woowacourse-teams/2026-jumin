import { css, cx } from '@emotion/css';
import { Link } from 'react-router';

import { ArrowDownIcon, ChevronRightIcon } from '../../../shared/components/ui/icons';
import { Row } from '../../../shared/components/ui/Row';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';
import { HeroMapAnimation } from '../components/HeroMapAnimation';
import { landing, MOBILE, TABLET } from '../landingStyles';

export const HeroSection = () => (
  <section className={styles.hero} aria-labelledby="landing-title">
    <div className={styles.inner}>
      <div className={styles.copy}>
        <p className={landing.eyebrow}>목적지 주변 주차장 비교</p>
        <h1 id="landing-title">
          목적지는 정했는데,
          <br />
          <span>주차는 어디에 하지?</span>
        </h1>
        <p className={styles.description}>
          주차의민족이 목적지에서 가깝고 <br />
          요금이 합리적인 주차장을 찾아드려요.
        </p>
        <Row align="center" gap={24} className={styles.actions}>
          <Link className={cx(landing.button, landing.primaryButton)} to="/">
            주차장 찾아보기 <ChevronRightIcon size={18} aria-hidden="true" />
          </Link>
          <a className={styles.textLink} href="#landing-guide">
            이용 방법 보기 <ArrowDownIcon size={16} aria-hidden="true" />
          </a>
        </Row>
        <p className={styles.note}>설치 없이 웹에서 바로 쓸 수 있어요.</p>
      </div>
      <div className={styles.demo}>
        <HeroMapAnimation />
      </div>
    </div>
  </section>
);

const styles = {
  hero: css`
    overflow: hidden;
    background: linear-gradient(
      180deg,
      ${color.background.default} 0%,
      ${color.background.brandSubtle} 100%
    );
  `,
  inner: css`
    ${landing.container};
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    align-items: center;
    gap: 64px;
    box-sizing: border-box;
    /* 처음 들어왔을 때 히어로 전체가 한 화면에 보이게 한다. 100px는 상단 헤더 높이다. */
    min-height: calc(100dvh - 100px);
    padding: clamp(16px, 3dvh, 40px) 0;
    ${TABLET} {
      gap: 32px;
    }
    ${MOBILE} {
      grid-template-columns: 1fr;
      gap: 48px;
      min-height: 0;
      padding: 48px 0 72px;
    }
  `,
  copy: css`
    animation: hero-appear 700ms ease both;
    h1 {
      margin-top: 20px;
      font-size: clamp(2.25rem, 4.6vw, 3.875rem);
      line-height: 1.25;
      font-weight: 800;
      letter-spacing: -2.4px;
      span {
        color: ${color.text.brand};
      }
    }
    @keyframes hero-appear {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
    ${MOBILE} {
      h1 {
        font-size: clamp(2rem, 9vw, 2.75rem);
        letter-spacing: -1.6px;
      }
    }
  `,
  description: css`
    margin-top: 24px !important;
    ${typography.body};
    font-size: 1.0625rem;
    line-height: 1.8;
    color: ${color.text.secondary};
    ${TABLET} {
      font-size: 0.9375rem;
      br {
        display: none;
      }
    }
  `,
  actions: css`
    flex-wrap: wrap;
    margin-top: 36px;
  `,
  textLink: css`
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    gap: 6px;
    ${typography.label};
    &:hover {
      color: ${color.text.brand};
    }
  `,
  note: css`
    margin-top: 16px !important;
    ${typography.caption};
    color: ${color.text.secondary};
  `,
  demo: css`
    animation: hero-appear 700ms 150ms ease both;
    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  `,
};
