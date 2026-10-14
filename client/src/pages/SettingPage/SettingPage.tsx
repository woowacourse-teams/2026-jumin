import { css, cx } from '@emotion/css';
import { Link } from 'react-router';

import brandMark from '../../../assets/icons/brandMark.svg';
import guideIcon from '../../../assets/icons/guideIcon.svg';
import installIcon from '../../../assets/icons/installIcon.svg';
import feedbackIcon from '../../../assets/icons/feedBackIcon.svg';
import { BottomNav } from '../../../shared/components/BottomNav';
import { GuideModal } from '../../../shared/components/Modal/GuideModal';
import { FEEDBACK_URL } from '../../../shared/constants/help';
import { useModal } from '../../../shared/hooks/useModal';
import { usePwaInstall } from '../../../shared/hooks/usePwaInstall';

export const SettingPage = () => {
  const guideModal = useModal();
  const { isInstalled, isInstalling, installMessage, handleInstall } = usePwaInstall();

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h1>설정</h1>
          <p className={styles.description}>주차의민족을 더 편하게 이용해 보세요.</p>
        </header>

        <Link className={styles.intro} to="/landing">
          <span className={styles.brandIcon}>
            <img src={brandMark} alt="" draggable={false} />
          </span>
          <span className={styles.copy}>
            <span className={styles.introLabel}>주차장을 찾는 가장 간단한 방법</span>
            <strong className={styles.introTitle}>주차의민족 소개</strong>
            <span className={styles.introLink}>
              서비스 알아보기 <span aria-hidden="true">›</span>
            </span>
          </span>
        </Link>

        <section className={styles.section} aria-labelledby="setting-guide-title">
          <h2 id="setting-guide-title" className={styles.sectionTitle}>
            이용 안내
          </h2>
          <div className={styles.menu}>
            <button className={styles.item} type="button" onClick={guideModal.open}>
              <span className={styles.iconFrame}>
                <img src={guideIcon} alt="" />
              </span>
              <span className={styles.copy}>
                <strong className={styles.itemTitle}>가이드 보기</strong>
                <span className={styles.itemDescription}>
                  검색부터 길찾기까지, 한눈에 알아봐요.
                </span>
              </span>
              <span className={styles.chevron} aria-hidden="true">
                ›
              </span>
            </button>
            <button
              className={styles.item}
              type="button"
              disabled={isInstalled || isInstalling}
              onClick={() => void handleInstall()}
            >
              <span className={cx(styles.iconFrame, styles.installIconFrame)}>
                <img src={installIcon} alt="" />
              </span>
              <span className={styles.copy}>
                <strong className={styles.itemTitle}>
                  {isInstalled ? '설치 완료' : isInstalling ? '설치창 여는 중' : '앱 설치'}
                </strong>
                <span className={styles.itemDescription}>
                  {isInstalled
                    ? '이미 앱으로 이용하고 있어요.'
                    : '홈 화면에서 더 빠르게 시작해 보세요.'}
                </span>
              </span>
              <span className={styles.chevron} aria-hidden="true">
                {isInstalled ? '✓' : '›'}
              </span>
            </button>
          </div>
          <p className={styles.installMessage} role="status" aria-live="polite">
            {installMessage}
          </p>
        </section>

        <section className={styles.section} aria-labelledby="setting-feedback-title">
          <h2 id="setting-feedback-title" className={styles.sectionTitle}>
            함께 만드는 주차의민족
          </h2>
          <div className={styles.menu}>
            <button
              className={styles.item}
              type="button"
              onClick={() => window.open(FEEDBACK_URL, '_blank', 'noopener,noreferrer')}
            >
              <span className={cx(styles.iconFrame, styles.feedbackIconFrame)}>
                <img src={feedbackIcon} alt="" />
              </span>
              <span className={styles.copy}>
                <strong className={styles.itemTitle}>피드백 보내기</strong>
                <span className={styles.itemDescription}>
                  불편한 점이나 좋은 아이디어를 들려주세요.
                </span>
              </span>
              <span className={styles.chevron} aria-hidden="true">
                ›
              </span>
            </button>
          </div>
        </section>
      </div>

      <BottomNav />
      {guideModal.isOpen && <GuideModal onClose={guideModal.close} />}
    </main>
  );
};

const styles = {
  page: css`
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    color: #18233d;
    font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
    background: #f7f8fc;
  `,
  content: css`
    height: calc(100% - var(--bottom-nav-height) - env(safe-area-inset-bottom, 0px));
    padding: calc(40px + env(safe-area-inset-top, 0px)) 24px 24px;
    overflow-y: auto;
  `,
  header: css`
    margin-bottom: 28px;

    h1 {
      margin: 0;
      font-size: 30px;
      font-weight: 800;
      line-height: 1.3;
      letter-spacing: -1px;
    }
  `,
  description: css`
    margin: 10px 0 0;
    color: #69758b;
    font-size: 14px;
    line-height: 1.6;
    word-break: keep-all;
  `,
  intro: css`
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 24px 20px;
    color: #18233d;
    text-decoration: none;
    background: #edf0ff;
    border: 1px solid #e0e5ff;
    border-radius: 22px;
    transition: background-color 150ms ease;

    &:hover {
      background: #e5eaff;
    }

    &:focus-visible {
      outline: 2px solid #4356d8;
      outline-offset: 3px;
    }
  `,
  brandIcon: css`
    display: grid;
    width: 62px;
    height: 72px;
    flex-shrink: 0;
    place-items: center;

    img {
      width: 48px;
      height: 54px;
    }
  `,
  copy: css`
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 6px;
  `,
  introLabel: css`
    color: #596681;
    font-size: 11px;
    line-height: 1.5;
    word-break: keep-all;
  `,
  introTitle: css`
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.6px;
  `,
  introLink: css`
    margin-top: 6px;
    color: #4356d8;
    font-size: 12px;
    font-weight: 700;
  `,
  section: css`
    margin-top: 30px;
  `,
  sectionTitle: css`
    margin: 0 0 12px 4px;
    color: #69758b;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.5;
  `,
  menu: css`
    overflow: hidden;
    background: #fff;
    border: 1px solid #e9edf5;
    border-radius: 20px;
  `,
  item: css`
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 96px;
    padding: 20px 16px;
    color: #18233d;
    font: inherit;
    text-align: left;
    background: transparent;
    border: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 150ms ease;

    & + & {
      border-top: 1px solid #eef1f7;
    }

    &:hover:not(:disabled) {
      background: #f7f8fc;
    }

    &:active:not(:disabled) {
      background: #edf0ff;
    }

    &:focus-visible {
      outline: 2px solid #4356d8;
      outline-offset: -3px;
    }

    &:disabled {
      cursor: default;
    }
  `,
  iconFrame: css`
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    background: #f0f2ff;
    border-radius: 13px;

    img {
      width: 21px;
      height: 21px;
    }
  `,
  installIconFrame: css`
    background: #edf7f3;
  `,
  feedbackIconFrame: css`
    background: #fff4e8;
  `,
  itemTitle: css`
    font-size: 15px;
    font-weight: 700;
    line-height: 1.4;
  `,
  itemDescription: css`
    color: #69758b;
    font-size: 12px;
    line-height: 1.6;
    word-break: keep-all;
  `,
  chevron: css`
    color: #8a94a2;
    font-size: 22px;
    line-height: 1;
  `,
  installMessage: css`
    margin: 0;
    padding: 0 4px;
    color: #4356d8;
    font-size: 12px;
    line-height: 1.6;
    word-break: keep-all;

    &:not(:empty) {
      margin-top: 12px;
    }
  `,
};
