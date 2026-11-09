import { css, cx, injectGlobal } from '@emotion/css';
import { Link } from 'react-router';

import brandMark from '../../../assets/icons/brandMark.svg';
import {
  ChevronRightIcon,
  DirectionsIcon,
  FreeParkingIcon,
  InstallIcon,
  LocationIcon,
} from '../../../shared/components/ui/icons';
import { usePwaInstall } from '../../../shared/hooks/usePwaInstall';
import { color } from '../../theme/color';
import { typography } from '../../theme/typography';
import { LandingGuide } from './components/LandingGuide';
import { LandingTechnology } from './components/LandingTechnology';
import { HeroSection } from './sections/HeroSection';

export const LandingPage = () => {
  const { isInstalled, isInstalling, installMessage, handleInstall } = usePwaInstall();

  return (
    <main className={styles.page} data-landing-page>
      <a className={styles.skipLink} href="#landing-intro">
        본문 바로가기
      </a>
      <header className={styles.header}>
        <Link className={styles.brand} to="/landing" aria-label="주차의민족 소개 홈">
          <img src={brandMark} alt="" width="29" height="32" />
          주차의민족
        </Link>
        <nav className={styles.navigation} aria-label="랜딩페이지 메뉴">
          <a href="#landing-intro">서비스 소개</a>
          <a href="#landing-guide">이용 방법</a>
          <a href="#landing-technology">기술 이야기</a>
        </nav>
        <Link className={styles.headerCta} to="/">
          시작하기 <ChevronRightIcon size={16} aria-hidden="true" />
        </Link>
      </header>

      <HeroSection />

      <section id="landing-intro" className={styles.intro} aria-labelledby="landing-intro-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>01 / 서비스 소개</p>
            <h2 id="landing-intro-title">
              주차장을 찾는 기준은,
              <br />
              사람마다 다르니까.
            </h2>
          </div>
          <p className={styles.description}>
            지도에서 하나씩 확인하던 주차 정보.
            <br />
            이제 내 목적지와 조건을 기준으로 살펴보세요.
          </p>
        </div>
        <div className={styles.features}>
          <article>
            <LocationIcon className={styles.featureIcon} size={28} aria-hidden="true" />
            <h3>원하는 조건으로 찾고</h3>
            <p>주변 지도에서 무료 주차장, 기계식 제외, 공영 주차장 조건으로 후보를 좁혀보세요.</p>
            <span className={styles.featureDetail}>무료 주차장 / 기계식 제외 / 공영 주차장</span>
          </article>
          <article>
            <FreeParkingIcon className={styles.featureIcon} size={28} aria-hidden="true" />
            <h3>거리와 요금을 비교하고</h3>
            <p>
              목적지까지의 예상 도보거리와 1시간 기준 예상 요금을 거리순·가격순·균형순으로
              비교하세요.
            </p>
            <span className={styles.featureDetail}>거리순 / 가격순 / 균형순</span>
          </article>
          <article>
            <DirectionsIcon className={styles.featureIcon} size={28} aria-hidden="true" />
            <h3>익숙한 지도로 출발하세요</h3>
            <p>운영시간과 로드뷰를 확인한 뒤, 네이버 지도·카카오맵·티맵으로 길찾기를 이어가세요.</p>
            <span className={styles.featureDetail}>상세정보 / 로드뷰 / 길찾기</span>
          </article>
        </div>
      </section>

      <LandingGuide />
      <LandingTechnology />

      <section
        id="landing-start"
        className={styles.closing}
        aria-labelledby="landing-closing-title"
      >
        <p className={styles.eyebrow}>04 / 시작하기</p>
        <h2 id="landing-closing-title">
          다음 목적지는 어디인가요?
          <br />
          주차장도 함께 찾아보세요.
        </h2>
        <p className={styles.description}>
          웹에서 바로 이용하거나, 홈 화면에 설치해 더 편하게 열어보세요.
        </p>
        <div className={styles.actions}>
          <Link className={cx(styles.button, styles.primaryButton)} to="/">
            주차장 찾아보기 <ChevronRightIcon size={19} aria-hidden="true" />
          </Link>
          <button
            className={cx(styles.button, styles.installButton)}
            type="button"
            onClick={() => void handleInstall()}
            disabled={isInstalled || isInstalling}
          >
            <InstallIcon size={19} aria-hidden="true" />
            {isInstalled ? '설치 완료' : isInstalling ? '설치창 여는 중' : '앱 설치하기'}
          </button>
        </div>
        <p className={styles.installMessage} role="status" aria-live="polite">
          {installMessage}
        </p>
      </section>

      <footer className={styles.footer}>
        <Link className={styles.brand} to="/landing">
          <img src={brandMark} alt="" width="23" height="26" />
          주차의민족
        </Link>
        <p>주차장을 찾는 가장 간단한 방법</p>
        <a href="#landing-technology">주차의민족의 기술 이야기</a>
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
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
    background: ${color.background.default};
    color: ${color.text.primary};
    font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
    word-break: keep-all;
    -webkit-font-smoothing: antialiased;
    & :where(h1, h2, h3, p, figure) {
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
      outline: 3px solid ${color.focus.ring};
      outline-offset: 5px;
    }
    section[id] {
      scroll-margin-top: 24px;
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
    background: ${color.background.default};
    border-radius: 8px;
    transform: translateY(-180%);
    &:focus {
      transform: translateY(0);
    }
  `,
  header: css`
    display: flex;
    width: min(100% - 96px, 1200px);
    min-height: 100px;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin: 0 auto;
    padding-top: env(safe-area-inset-top, 0px);
    @media (max-width: 700px) {
      width: calc(100% - 40px);
      min-height: 112px;
      flex-wrap: wrap;
      gap: 0;
      padding-top: 20px;
      padding-bottom: 12px;
    }
  `,
  brand: css`
    display: inline-flex;
    align-items: center;
    gap: 9px;
    flex-shrink: 0;
    font-size: 1.375rem;
    font-weight: 800;
    letter-spacing: -0.8px;
    @media (max-width: 700px) {
      font-size: 1.1875rem;
      img {
        width: 24px;
        height: 27px;
      }
    }
  `,
  navigation: css`
    display: flex;
    gap: 32px;
    ${typography.label};
    color: ${color.text.secondary};
    a {
      padding: 12px 0;
    }
    a:hover {
      color: ${color.text.brand};
    }
    @media (max-width: 700px) {
      order: 3;
      width: 100%;
      gap: 24px;
      font-size: 0.8125rem;
    }
  `,
  headerCta: css`
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 42px;
    padding: 0 18px;
    border: 1px solid ${color.border.default};
    border-radius: 8px;
    ${typography.label};
    &:hover {
      background: ${color.background.subtle};
    }
    @media (max-width: 700px) {
      min-height: 36px;
      padding: 0 12px;
      font-size: 0.75rem;
    }
  `,
  eyebrow: css`
    ${typography.label};
    color: ${color.text.brand};
    letter-spacing: 0.1px;
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 20px;
    margin-top: 32px;
    @media (max-width: 1000px) {
      gap: 16px;
    }
  `,
  button: css`
    display: inline-flex;
    min-height: 56px;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 0 24px;
    border: 1px solid transparent;
    border-radius: 10px;
    ${typography.label};
    font-size: 0.9375rem;
    cursor: pointer;
    transition: background 160ms ease;
    &:disabled {
      color: ${color.text.disabled};
      cursor: default;
    }
  `,
  primaryButton: css`
    color: ${color.text.inverse} !important;
    background: ${color.background.brand};
    &:hover {
      background: ${color.background.brandHovered};
    }
  `,
  intro: css`
    width: min(100% - 96px, 1200px);
    margin: 0 auto;
    padding: 88px 0 104px;
    border-top: 1px solid ${color.border.default};
    @media (max-width: 700px) {
      width: calc(100% - 40px);
      padding: 56px 0 64px;
    }
  `,
  sectionHeading: css`
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 32px;
    h2 {
      margin-top: 20px;
      font-size: clamp(1.875rem, 3.3vw, 2.75rem);
      line-height: 1.4;
      font-weight: 800;
      letter-spacing: -1.6px;
    }
    @media (max-width: 900px) {
      align-items: flex-start;
      flex-direction: column;
      gap: 20px;
    }
  `,
  description: css`
    ${typography.body};
    line-height: 1.8;
    color: ${color.text.secondary};
    @media (max-width: 700px) {
      font-size: 0.875rem;
    }
  `,
  features: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 40px;
    margin-top: 52px;
    article {
      display: flex;
      align-items: flex-start;
      flex-direction: column;
      padding-top: 28px;
      border-top: 2px solid ${color.border.brandSubtle};
    }
    h3 {
      margin: 20px 0 14px;
      ${typography.titleSection};
      letter-spacing: -0.5px;
    }
    p {
      margin-bottom: 24px;
      ${typography.bodySmall};
      line-height: 1.8;
      color: ${color.text.secondary};
    }
    @media (max-width: 900px) {
      gap: 24px;
    }
    @media (max-width: 700px) {
      grid-template-columns: 1fr;
      gap: 32px;
      margin-top: 36px;
    }
  `,
  featureIcon: css`
    color: ${color.icon.brand};
  `,
  featureDetail: css`
    margin-top: auto;
    ${typography.caption};
    color: ${color.text.brand};
  `,
  closing: css`
    padding: 104px 24px;
    background: ${color.background.brandSubtle};
    text-align: center;
    h2 {
      margin: 20px 0;
      font-size: clamp(1.75rem, 3.6vw, 2.75rem);
      line-height: 1.4;
      font-weight: 800;
      letter-spacing: -1.5px;
    }
    > div {
      justify-content: center;
    }
    @media (max-width: 700px) {
      padding: 72px 20px;
      > div {
        flex-direction: column;
        gap: 12px;
      }
      a,
      button {
        width: min(100%, 320px);
      }
    }
  `,
  installButton: css`
    color: ${color.text.primary};
    background: ${color.background.default};
    border-color: ${color.border.default};
    &:hover:enabled {
      background: ${color.background.subtle};
    }
  `,
  installMessage: css`
    max-width: 450px;
    margin: 18px auto 0 !important;
    ${typography.bodySmall};
    &:empty {
      display: none;
    }
  `,
  footer: css`
    display: flex;
    width: min(100% - 96px, 1200px);
    align-items: center;
    flex-wrap: wrap;
    gap: 24px;
    margin: 0 auto;
    padding: 40px 0 calc(40px + env(safe-area-inset-bottom, 0px));
    ${typography.caption};
    color: ${color.text.secondary};
    > a:first-child {
      color: ${color.text.primary};
      font-size: 1.125rem;
    }
    > a:last-child {
      margin-left: auto;
    }
    @media (max-width: 700px) {
      width: calc(100% - 40px);
      align-items: flex-start;
      flex-direction: column;
      gap: 16px;
      > a:last-child {
        margin-left: 0;
      }
    }
  `,
};
