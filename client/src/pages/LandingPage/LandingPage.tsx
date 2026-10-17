import { css, cx, injectGlobal } from '@emotion/css';
import { Link } from 'react-router';

import brandMark from '../../../assets/icons/brandMark.svg';
import { usePwaInstall } from '../../../shared/hooks/usePwaInstall';
import parkingHero from '../../../assets/parking-hero.jpg';
import { LandingGuide } from './components/LandingGuide';
import { color } from '../../theme/color';
import { fontSize, fontWeight, lineHeight } from '../../theme/font';
import { typography } from '../../theme/typography';

export const LandingPage = () => {
  const { isInstalled, isInstalling, installMessage, handleInstall } = usePwaInstall();

  return (
    <main className={styles.page} data-landing-page>
      <a className={styles.skipLink} href="#landing-intro">
        본문 바로가기
      </a>

      <section className={styles.hero} aria-labelledby="landing-title">
        <img className={styles.heroPhoto} src={parkingHero} alt="" fetchPriority="high" />

        <header className={styles.header}>
          <Link className={styles.brand} to="/landing" aria-label="주차의민족 소개 홈">
            <img src={brandMark} alt="" width="29" height="32" />
            <span>주차의민족</span>
          </Link>
          <nav className={styles.navigation} aria-label="랜딩페이지 메뉴">
            <a href="#landing-intro">서비스 소개</a>
            <a href="#landing-guide">이용 방법</a>
            <Link to="/">주차장 찾기</Link>
          </nav>
        </header>

        <div className={styles.heroContent}>
          <p className={styles.heroEyebrow}>주차장을 찾는 가장 간단한 방법</p>
          <h1 id="landing-title">
            목적지를 입력하면,
            <br />
            주차장을 추천해드려요.
          </h1>
          <p className={styles.heroDescription}>목적지 주변의 주차장을 추천해드립니다.</p>
          <div className={styles.actions}>
            <Link className={cx(styles.button, styles.primaryButton)} to="/">
              주차의민족 이용하기
            </Link>
            <button
              className={cx(styles.button, styles.installButton)}
              type="button"
              onClick={() => void handleInstall()}
              disabled={isInstalled || isInstalling}
            >
              {isInstalled ? '설치 완료' : isInstalling ? '설치창 여는 중' : '앱 설치하기'}
              {!isInstalled}
            </button>
          </div>
          <p className={styles.installMessage} role="status" aria-live="polite">
            {installMessage}
          </p>
        </div>

        <a className={styles.scrollLink} href="#landing-intro">
          서비스 알아보기 <span aria-hidden="true">↓</span>
        </a>
      </section>

      <section id="landing-intro" className={styles.intro} aria-labelledby="landing-intro-title">
        <p className={styles.eyebrow}>주차의민족</p>
        <h2 id="landing-intro-title">
          어디에 주차할지 고민될 때,
          <br />
          목적지만 검색하세요.
        </h2>
        <p className={cx(styles.description, styles.introProblem)}>
          지도나 주차장 앱에서 거리와 요금을 하나씩 확인하며,
          <br />
          어느 주차장으로 갈지 고민했던 분들을 위해 만들었어요.
        </p>
        <p className={styles.introSolution}>
          목적지 주변 주차장의 <strong>거리와 예상 요금</strong>을 비교해,
          <br />
          추천 주차장을 알려드려요.
        </p>
      </section>

      <LandingGuide />

      <section className={styles.closing} aria-labelledby="landing-closing-title">
        <h2 id="landing-closing-title">
          다음 목적지의 주차장,
          <br />
          지금 찾아보세요.
        </h2>
        <Link className={cx(styles.button, styles.closingButton)} to="/">
          주차의민족 이용하기
        </Link>
      </section>

      <footer className={styles.footer}>
        <Link className={styles.footerBrand} to="/landing">
          <img src={brandMark} alt="" width="22" height="25" />
          주차의민족
        </Link>
        <p>주차장을 찾는 가장 간단한 방법</p>
      </footer>
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
    --landing-primary: ${color.text.brand};
    --landing-ink: ${color.text.primary};
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
    color: var(--landing-ink);
    background: ${color.background.default};
    font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
    word-break: keep-all;

    :where(h1, h2, p, figure) {
      margin: 0;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
    button {
      font-family: inherit;
    }
    a:focus-visible,
    button:focus-visible {
      outline: 3px solid ${color.border.focused};
      outline-offset: 6px;
    }

    @media (prefers-reduced-motion: reduce) {
      scroll-behavior: auto;
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
      }
    }
  `,
  skipLink: css`
    position: absolute;
    top: 12px;
    left: 16px;
    z-index: 5;
    padding: 12px 18px;
    ${typography.bodySmall};
    color: ${color.text.primary} !important;
    background: ${color.background.default};
    border-radius: 8px;
    transform: translateY(-180%);
    &:focus {
      transform: translateY(0);
    }
  `,
  hero: css`
    position: relative;
    display: flex;
    min-height: max(700px, 100svh);
    flex-direction: column;
    color: ${color.text.inverse};
    background: ${color.background.inverse};
    isolation: isolate;

    &::after {
      position: absolute;
      inset: 0;
      z-index: -1;
      content: '';
      background:
        linear-gradient(90deg, rgb(9 17 29 / 84%), rgb(9 17 29 / 42%) 68%, rgb(9 17 29 / 28%)),
        linear-gradient(0deg, rgb(9 17 29 / 28%), transparent 30%);
    }

    @media (max-width: 700px) {
      min-height: max(640px, 100svh);
      &::after {
        background: rgb(9 17 29 / 72%);
      }
    }
  `,
  heroPhoto: css`
    position: absolute;
    inset: 0;
    z-index: -2;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  `,
  header: css`
    display: flex;
    width: min(100% - 112px, 1240px);
    min-height: 100px;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin: 0 auto;
    padding-top: env(safe-area-inset-top, 0px);

    @media (max-width: 700px) {
      width: calc(100% - 48px);
      min-height: 86px;
      gap: 12px;
    }
  `,
  brand: css`
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    font-size: 1.5625rem;
    font-weight: ${fontWeight[800]};
    letter-spacing: -1.1px;
    img {
      filter: brightness(0) invert(1);
    }

    @media (max-width: 700px) {
      gap: 8px;
      font-size: 1.3125rem;
      img {
        width: 23px;
        height: 26px;
      }
    }
  `,
  navigation: css`
    display: flex;
    align-items: center;
    gap: 36px;
    ${typography.label};
    a {
      padding: 12px 0;
    }
    a:hover {
      color: ${color.text.inverseSecondary};
    }
    span {
      margin-left: 8px;
    }

    @media (max-width: 700px) {
      font-size: ${fontSize[12]};
      a:not(:last-child) {
        display: none;
      }
      span {
        margin-left: 3px;
      }
    }
  `,
  heroContent: css`
    width: min(100% - 112px, 1240px);
    margin: auto;
    padding: 110px 0 150px;
    animation: landing-appear 700ms ease both;

    h1 {
      margin: 24px 0 28px;
      ${typography.titlePage};
      font-size: clamp(2.75rem, 4.7vw, 4.375rem);
      letter-spacing: -2.8px;
    }

    @keyframes landing-appear {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 700px) {
      width: calc(100% - 48px);
      padding: 64px 0 100px;
      h1 {
        margin: 20px 0 22px;
        font-size: clamp(1.9375rem, 7.7vw, 3.125rem);
        letter-spacing: -1.4px;
      }
    }
  `,
  heroEyebrow: css`
    ${typography.body};
    color: ${color.text.inverseSecondary};
    font-weight: ${fontWeight[700]};
    letter-spacing: -0.2px;
    @media (max-width: 700px) {
      font-size: ${fontSize[14]};
    }
  `,
  heroDescription: css`
    ${typography.body};
    color: ${color.text.inverseSecondary};
    font-size: ${fontSize[18]};
    letter-spacing: -0.4px;
    @media (max-width: 700px) {
      max-width: 300px;
      font-size: ${fontSize[16]};
    }
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 42px;

    @media (max-width: 700px) {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      max-width: 360px;
      margin-top: 32px;
    }
  `,
  button: css`
    display: inline-flex;
    min-height: 62px;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: 0 28px;
    ${typography.label};
    font-size: ${fontSize[16]};
    border: 1px solid transparent;
    border-radius: 10px;
    cursor: pointer;
    transition:
      background 160ms ease,
      transform 160ms ease;
    span {
      font-size: ${fontSize[20]};
      font-weight: ${fontWeight[400]};
    }
    &:hover {
      transform: translateY(-2px);
    }
    &:disabled {
      cursor: default;
      transform: none;
    }
    @media (max-width: 700px) {
      min-height: 56px;
      font-size: ${fontSize[14]};
    }
  `,
  primaryButton: css`
    min-width: 250px;
    color: ${color.text.inverse};
    background: ${color.background.brand};
    &:hover {
      background: ${color.background.brandHovered};
    }
    &:active {
      background: ${color.background.brandPressed};
    }
  `,
  installButton: css`
    min-width: 190px;
    color: ${color.text.secondary};
    background: ${color.background.default};
    &:hover {
      background: ${color.background.neutralPressed};
    }
    &:disabled {
      color: ${color.text.disabled};
    }
  `,
  installMessage: css`
    max-width: 450px;
    margin-top: 14px !important;
    ${typography.bodySmall};
    color: ${color.text.inverse};
    &:empty {
      display: none;
    }
  `,
  scrollLink: css`
    position: absolute;
    bottom: max(34px, env(safe-area-inset-bottom, 0px));
    left: 50%;
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    ${typography.caption};
    color: ${color.text.inverseSecondary} !important;
    transform: translateX(-50%);
    span {
      font-size: ${fontSize[20]};
    }
    @media (max-width: 700px) {
      bottom: max(20px, env(safe-area-inset-bottom, 0px));
    }
  `,
  intro: css`
    max-width: 1240px;
    margin: 0 auto;
    padding: 120px 56px 64px;
    text-align: center;
    h2 {
      margin: 20px 0 24px;
      ${typography.titlePage};
      font-size: clamp(2rem, 3.8vw, 3rem);
      letter-spacing: -1.8px;
    }
    @media (max-width: 700px) {
      padding: 80px 24px 44px;
    }
  `,
  introProblem: css`
    max-width: 640px;
    margin: 0 auto !important;
  `,
  introSolution: css`
    margin: 28px 0 0 !important;
    ${typography.body};
    font-size: ${fontSize[20]};
    font-weight: ${fontWeight[700]};
    letter-spacing: -0.5px;
    strong {
      color: var(--landing-primary);
      font-weight: ${fontWeight[700]};
    }
    @media (max-width: 700px) {
      margin-top: 24px !important;
      font-size: ${fontSize[18]};
    }
  `,
  eyebrow: css`
    color: var(--landing-primary);
    ${typography.label};
  `,
  description: css`
    ${typography.body};
    color: ${color.text.secondary};
    letter-spacing: -0.4px;
    @media (max-width: 700px) {
      font-size: ${fontSize[14]};
    }
  `,
  closing: css`
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 36px;
    padding: 96px 24px;
    color: ${color.text.inverse};
    background: ${color.background.brand};
    text-align: center;
    h2 {
      ${typography.titlePage};
      font-size: clamp(${fontSize[30]}, 3.6vw, 2.875rem);
      line-height: ${lineHeight[140]};
      letter-spacing: -1.5px;
    }
    @media (max-width: 700px) {
      padding: 72px 24px;
    }
  `,
  closingButton: css`
    color: var(--landing-primary) !important;
    background: ${color.background.default};
    &:hover {
      background: ${color.background.brandSubtle};
    }
  `,
  footer: css`
    display: flex;
    max-width: 1352px;
    align-items: center;
    flex-wrap: wrap;
    gap: 24px;
    margin: 0 auto;
    padding: 44px 56px calc(44px + env(safe-area-inset-bottom, 0px));
    ${typography.caption};
    color: ${color.text.secondary};
    @media (max-width: 700px) {
      align-items: flex-start;
      flex-direction: column;
      gap: 14px;
      padding: 36px 24px calc(36px + env(safe-area-inset-bottom, 0px));
    }
  `,
  footerBrand: css`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--landing-ink) !important;
    ${typography.titleCard};
    letter-spacing: -0.7px;
  `,
};
