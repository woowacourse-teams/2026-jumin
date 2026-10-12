import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { cx } from '@emotion/css';

import brandMark from '../../../assets/icons/brandMark.svg';
import searchPreview from '../../../assets/guideImage/guide1.png';
import comparePreview from '../../../assets/guideImage/guide3.png';
import { showInstallGuide } from '../../../shared/pwa/addToHomeScreen';
import {
  getInstallAvailability,
  initializeInstallPrompt,
  requestPwaInstall,
} from '../../../shared/pwa/installPrompt';
import parkingHero from './assets/parking-hero.jpg';
import { styles } from './RendingPage.styles';

const features = [
  {
    label: '목적지 검색',
    title: (
      <>
        가고 싶은 곳을
        <br />
        먼저 알려주세요.
      </>
    ),
    description: '장소를 검색하거나 지도에서 목적지를 선택하세요. 주변 주차장을 추천해드려요.',
    image: searchPreview,
    alt: '목적지 검색창이 표시된 주차의민족 지도 화면 예시',
  },
  {
    label: '거리와 요금 비교',
    title: (
      <>
        가까운 곳, 저렴한 곳.
        <br />내 기준으로 고르세요.
      </>
    ),
    description: '거리순·가격순·균형순으로 비교하고, 선택한 주차장으로 길찾기를 시작하세요.',
    image: comparePreview,
    alt: '주차의민족 지도에서 도보 거리와 예상 요금을 비교하는 화면 예시',
  },
];

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches === true ||
  ('standalone' in navigator && navigator.standalone === true);

export const RendingPage = () => {
  const [isInstalled, setIsInstalled] = useState(isStandalone);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState('');

  useEffect(() => {
    initializeInstallPrompt();

    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallMessage('');
    };
    window.addEventListener('appinstalled', handleInstalled);

    return () => window.removeEventListener('appinstalled', handleInstalled);
  }, []);

  const handleInstall = async () => {
    setInstallMessage('');
    setIsInstalling(true);

    try {
      if (!getInstallAvailability()) {
        showInstallGuide();
        return;
      }

      const outcome = await requestPwaInstall();
      if (outcome === 'accepted') {
        setInstallMessage('설치가 끝나면 홈 화면에서 주차의민족을 열 수 있어요.');
      }
    } catch {
      setInstallMessage('설치창을 열지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <main className={styles.page} data-rending-page>
      <a className={styles.skipLink} href="#rending-intro">
        본문 바로가기
      </a>

      <section className={styles.hero} aria-labelledby="rending-title">
        <img className={styles.heroPhoto} src={parkingHero} alt="" fetchPriority="high" />

        <header className={styles.header}>
          <Link className={styles.brand} to="/rending" aria-label="주차의민족 소개 홈">
            <img src={brandMark} alt="" width="29" height="32" />
            <span>주차의민족</span>
          </Link>
          <nav className={styles.navigation} aria-label="랜딩페이지 메뉴">
            <a href="#rending-intro">서비스 소개</a>
            <a href="#rending-guide">이용 방법</a>
            <Link to="/">주차장 찾기</Link>
          </nav>
        </header>

        <div className={styles.heroContent}>
          <p className={styles.heroEyebrow}>주차장을 찾는 가장 간단한 방법</p>
          <h1 id="rending-title">
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

        <a className={styles.scrollLink} href="#rending-intro">
          서비스 알아보기 <span aria-hidden="true">↓</span>
        </a>
      </section>

      <section id="rending-intro" className={styles.intro} aria-labelledby="rending-intro-title">
        <p className={styles.eyebrow}>주차의민족</p>
        <h2 id="rending-intro-title">
          목적지는 정했으니까,
          <br />
          주차장은 여기서.
        </h2>
        <p className={styles.description}>검색부터 추천, 길찾기까지 한 흐름으로.</p>
      </section>

      <div id="rending-guide" className={styles.features}>
        {features.map((feature, index) => (
          <section
            key={feature.label}
            className={cx(styles.feature, index === 1 && styles.reversedFeature)}
            aria-labelledby={`rending-feature-${index}`}
          >
            <div className={styles.featureCopy}>
              <p className={styles.eyebrow}>{feature.label}</p>
              <h2 id={`rending-feature-${index}`}>{feature.title}</h2>
              <p className={styles.description}>{feature.description}</p>
            </div>
            <figure className={styles.preview}>
              <img src={feature.image} alt={feature.alt} width="342" height="393" loading="lazy" />
              <figcaption>서비스 화면 예시</figcaption>
            </figure>
          </section>
        ))}
      </div>

      <section className={styles.closing} aria-labelledby="rending-closing-title">
        <h2 id="rending-closing-title">
          다음 목적지의 주차장,
          <br />
          지금 찾아보세요.
        </h2>
        <Link className={cx(styles.button, styles.closingButton)} to="/">
          주차의민족 이용하기
        </Link>
      </section>

      <footer className={styles.footer}>
        <Link className={styles.footerBrand} to="/rending">
          <img src={brandMark} alt="" width="22" height="25" />
          주차의민족
        </Link>
        <p>주차장을 찾는 가장 간단한 방법</p>
      </footer>
    </main>
  );
};
