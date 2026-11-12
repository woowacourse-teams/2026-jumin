import { Row } from '../../shared/components/ui/Row';
import { css, cx, injectGlobal } from '@emotion/css';
import { Link } from 'react-router';

import brandMark from '../../../assets/icons/brandMark.svg';
import { ChevronRightIcon, InstallIcon } from '../../shared/components/ui/icons';
import { usePwaInstall } from '../../shared/hooks/usePwaInstall';
import { color } from '../../theme/color';
import { typography } from '../../theme/typography';
import { LandingGuide } from './components/LandingGuide';
import { LandingTechnology } from './components/LandingTechnology';
import { useLandingScroll } from './hooks/useLandingScroll';
import { EASE_OUT, HEADER_HEIGHT, landing, MOBILE, REDUCE_MOTION } from './landingStyles';
import { IntroSection } from './sections/IntroSection';
import { HeroSection } from './sections/HeroSection';

export const LandingPage = () => {
  const { isInstalled, isInstalling, installMessage, handleInstall } = usePwaInstall();
  const scrollerRef = useLandingScroll<HTMLElement>();

  return (
    <main ref={scrollerRef} className={styles.page} data-landing-page>
      <a className={styles.skipLink} href="#landing-intro">
        본문 바로가기
      </a>
      <header className={styles.header}>
        <Row align="center" justify="between" gap={24} className={styles.headerInner}>
          <Link className={styles.brand} to="/landing" aria-label="주차의민족 소개 홈">
            <img src={brandMark} alt="" width="25" height="28" />
            주차의민족
          </Link>
          <Row as="nav" gap={8} className={styles.navigation} aria-label="랜딩페이지 메뉴">
            <a href="#landing-intro">서비스 소개</a>
            <a href="#landing-guide">이용 방법</a>
            <a href="#landing-technology">기술 이야기</a>
          </Row>
          <Link className={styles.headerCta} to="/">
            시작하기
          </Link>
        </Row>
        <span className={styles.progress} aria-hidden="true" />
      </header>

      <HeroSection />
      <IntroSection />
      <LandingGuide />
      <LandingTechnology />

      <section
        id="landing-start"
        className={styles.closing}
        aria-labelledby="landing-closing-title"
      >
        <div className={styles.closingCard} data-reveal>
          <span className={cx(styles.orb, styles.orbLeft)} aria-hidden="true" />
          <span className={cx(styles.orb, styles.orbRight)} aria-hidden="true" />
          <h2 id="landing-closing-title">
            다음 목적지는 어디인가요?
            <br />
            주차장도 함께 찾아보세요.
          </h2>
          <p className={styles.closingDescription}>
            웹에서 바로 이용하거나, 홈 화면에 설치해 더 편하게 열어보세요.
          </p>
          <Row align="center" justify="center" gap={12} className={styles.actions}>
            <Link className={cx(landing.button, styles.lightButton)} to="/">
              주차장 찾아보기 <ChevronRightIcon size={19} aria-hidden="true" />
            </Link>
            <button
              className={cx(landing.button, styles.installButton)}
              type="button"
              onClick={() => void handleInstall()}
              disabled={isInstalled || isInstalling}
            >
              <InstallIcon size={19} aria-hidden="true" />
              {isInstalled ? '설치 완료' : isInstalling ? '설치창 여는 중' : '앱 설치하기'}
            </button>
          </Row>
          <p className={styles.installMessage} role="status" aria-live="polite">
            {installMessage}
          </p>
        </div>
      </section>

      <Row as="footer" align="center" gap={24} className={styles.footer}>
        <Link className={styles.brand} to="/landing">
          <img src={brandMark} alt="" width="23" height="26" />
          주차의민족
        </Link>
        <p>주차장을 찾는 가장 간단한 방법</p>
        <a href="#landing-technology">주차의민족의 기술 이야기</a>
      </Row>
    </main>
  );
};

const applyLandingRootStyles = () => injectGlobal`
  #root:has([data-landing-page]) {
    width: 100%;
    max-width: none;
    height: 100dvh;
    margin: 0;
    border-radius: 0;
  }
`;

applyLandingRootStyles();

const styles = {
  page: css`
    --scroll-progress: 0;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
    background: ${color.background.default};
    color: ${color.text.primary};
    font-family:
      Pretendard,
      -apple-system,
      BlinkMacSystemFont,
      'Apple SD Gothic Neo',
      'Noto Sans KR',
      sans-serif;
    word-break: keep-all;
    -webkit-font-smoothing: antialiased;
    & :where(h1, h2, h3, p, figure) {
      margin: 0;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
    button,
    input {
      font-family: inherit;
    }
    section[id] {
      scroll-margin-top: ${HEADER_HEIGHT}px;
    }

    /* 화면에 들어올 때 아래에서 떠오른다. useLandingScroll이 data-revealed를 단다. */
    :where([data-reveal]) {
      transition:
        opacity 900ms ${EASE_OUT} var(--reveal-delay, 0ms),
        transform 900ms ${EASE_OUT} var(--reveal-delay, 0ms);
    }
    &[data-reveal-ready] [data-reveal]:not([data-revealed]) {
      opacity: 0;
      transform: translateY(40px);
    }

    ${REDUCE_MOTION} {
      scroll-behavior: auto;
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
      }
    }
    ${MOBILE} {
      section[id] {
        scroll-margin-top: 16px;
      }
    }
  `,
  skipLink: css`
    position: absolute;
    top: 12px;
    left: 16px;
    z-index: 20;
    padding: 12px 18px;
    background: ${color.background.default};
    border-radius: 8px;
    transform: translateY(-180%);
    &:focus {
      transform: translateY(0);
    }
  `,
  header: css`
    position: sticky;
    top: 0;
    z-index: 10;
    padding-top: env(safe-area-inset-top, 0px);
    border-bottom: 1px solid transparent;
    background: rgb(255 255 255 / 88%);
    backdrop-filter: saturate(180%) blur(20px);
    transition: border-color 300ms ease;
    [data-scrolled] > & {
      border-color: ${color.border.default};
    }
    ${MOBILE} {
      position: static;
      background: ${color.background.default};
    }
  `,
  headerInner: css`
    ${landing.container};
    min-height: ${HEADER_HEIGHT}px;
    ${MOBILE} {
      flex-wrap: wrap;
      gap: 0;
      padding: 16px 0 4px;
    }
  `,
  /* 스크롤 진행률만큼 차오르는 선. */
  progress: css`
    position: absolute;
    right: 0;
    bottom: -1px;
    left: 0;
    height: 2px;
    background: ${color.background.brand};
    transform: scaleX(var(--scroll-progress));
    transform-origin: 0 50%;
    ${MOBILE} {
      display: none;
    }
  `,
  brand: css`
    display: inline-flex;
    align-items: center;
    gap: 9px;
    flex-shrink: 0;
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: -0.04em;
  `,
  navigation: css`
    ${typography.label};
    font-size: 0.9375rem;
    color: ${color.text.secondary};
    a {
      padding: 10px 14px;
      border-radius: 10px;
      transition:
        background 200ms ease,
        color 200ms ease;
    }
    a:hover {
      background: ${color.background.subtle};
      color: ${color.text.primary};
    }
    ${MOBILE} {
      order: 3;
      width: 100%;
      margin: 8px -14px 0;
    }
  `,
  headerCta: css`
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 18px;
    border-radius: 12px;
    background: ${color.background.brand};
    ${typography.label};
    color: ${color.text.inverse} !important;
    transition:
      background 200ms ease,
      transform 300ms ${EASE_OUT};
    &:hover {
      background: ${color.background.brandHovered};
    }
    &:active {
      transform: scale(0.96);
    }
  `,
  closing: css`
    padding: 120px 0;
    ${MOBILE} {
      padding: 72px 0;
    }
  `,
  closingCard: css`
    ${landing.container};
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    padding: 104px 32px;
    border-radius: 48px;
    background: linear-gradient(135deg, ${color.background.brand} 0%, #5a6de6 55%, #7f6df2 100%);
    color: ${color.text.inverse};
    text-align: center;
    h2 {
      position: relative;
      font-size: clamp(1.75rem, 4vw, 3.25rem);
      line-height: 1.3;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    ${MOBILE} {
      padding: 64px 20px;
      border-radius: 32px;
    }
  `,
  orb: css`
    position: absolute;
    width: 420px;
    height: 420px;
    border-radius: 50%;
    background: radial-gradient(circle, rgb(255 255 255 / 28%), transparent 65%);
    animation: landing-orb-drift 12s ease-in-out infinite alternate;
    @keyframes landing-orb-drift {
      to {
        transform: translate(40px, -30px) scale(1.15);
      }
    }
  `,
  orbLeft: css`
    top: -180px;
    left: -120px;
  `,
  orbRight: css`
    right: -140px;
    bottom: -220px;
    animation-delay: -6s;
  `,
  closingDescription: css`
    position: relative;
    margin-top: 20px !important;
    font-size: clamp(1rem, 1.5vw, 1.1875rem);
    font-weight: 500;
    line-height: 1.7;
    color: rgb(255 255 255 / 82%);
  `,
  actions: css`
    position: relative;
    flex-wrap: wrap;
    margin-top: 40px;
    ${MOBILE} {
      flex-direction: column;
      a,
      button {
        width: min(100%, 320px);
      }
    }
  `,
  lightButton: css`
    color: ${color.text.brand} !important;
    background: ${color.background.default};
    box-shadow: 0 16px 32px -16px rgb(16 27 55 / 60%);
    &:hover {
      transform: translateY(-2px);
    }
    &:active {
      transform: scale(0.97);
    }
  `,
  installButton: css`
    color: ${color.text.inverse};
    background: rgb(255 255 255 / 16%);
    border-color: rgb(255 255 255 / 30%);
    &:hover:enabled {
      background: rgb(255 255 255 / 26%);
    }
  `,
  installMessage: css`
    position: relative;
    max-width: 450px;
    margin: 18px auto 0 !important;
    ${typography.bodySmall};
    &:empty {
      display: none;
    }
  `,
  footer: css`
    ${landing.container};
    flex-wrap: wrap;
    padding: 8px 0 calc(48px + env(safe-area-inset-bottom, 0px));
    ${typography.caption};
    color: ${color.text.secondary};
    > a:first-child {
      color: ${color.text.primary};
      font-size: 1.125rem;
    }
    > a:last-child {
      margin-left: auto;
    }
    ${MOBILE} {
      align-items: flex-start;
      flex-direction: column;
      gap: 16px;
      > a:last-child {
        margin-left: 0;
      }
    }
  `,
};
