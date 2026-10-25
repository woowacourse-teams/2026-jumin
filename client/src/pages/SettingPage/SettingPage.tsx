import { css } from '@emotion/css';
import { Link } from 'react-router';

import brandMark from '../../../assets/icons/brandMark.svg';
import {
  CheckIcon,
  ChevronRightIcon,
  FeedbackIcon,
  GuideIcon,
  InstallIcon,
} from '../../../shared/components/ui/icons';
import { BottomNav } from '../../../shared/components/service/BottomNav';
import { GuideModal } from '../../../shared/components/service/guide/GuideModal';
import { FEEDBACK_URL } from '../../../shared/constants/help';
import { useModal } from '../../../shared/hooks/useModal';
import { usePwaInstall } from '../../../shared/hooks/usePwaInstall';
import { color } from '../../theme/color';
import { typography } from '../../theme/typography';

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
              서비스 알아보기 <ChevronRightIcon size={16} aria-hidden="true" />
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
                <GuideIcon size={21} aria-hidden="true" />
              </span>
              <span className={styles.copy}>
                <strong className={styles.itemTitle}>가이드 보기</strong>
                <span className={styles.itemDescription}>
                  검색부터 길찾기까지, 한눈에 알아봐요.
                </span>
              </span>
              <span className={styles.chevron} aria-hidden="true">
                <ChevronRightIcon size={16} />
              </span>
            </button>
            <button
              className={styles.item}
              type="button"
              disabled={isInstalled || isInstalling}
              onClick={() => void handleInstall()}
            >
              <span className={styles.iconFrame}>
                <InstallIcon size={21} aria-hidden="true" />
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
                {isInstalled ? <CheckIcon size={16} /> : <ChevronRightIcon size={16} />}
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
              <span className={styles.iconFrame}>
                <FeedbackIcon size={21} aria-hidden="true" />
              </span>
              <span className={styles.copy}>
                <strong className={styles.itemTitle}>피드백 보내기</strong>
                <span className={styles.itemDescription}>
                  불편한 점이나 좋은 아이디어를 들려주세요.
                </span>
              </span>
              <span className={styles.chevron} aria-hidden="true">
                <ChevronRightIcon size={16} />
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
    color: ${color.text.primary};
    font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
    background: ${color.background.subtle};
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
      ${typography.titlePage};
      letter-spacing: -1px;
    }
  `,
  description: css`
    margin: 10px 0 0;
    ${typography.bodySmall};
    color: ${color.text.secondary};
    word-break: keep-all;
  `,
  intro: css`
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 24px 20px;
    color: ${color.text.primary};
    text-decoration: none;
    background: ${color.background.brandSubtle};
    border: 1px solid ${color.border.brandSubtle};
    border-radius: 22px;
    transition: background-color 150ms ease;

    &:hover {
      background: ${color.background.brandSubtleHovered};
    }

    &:focus-visible {
      outline: 2px solid ${color.focus.ring};
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
    ${typography.caption};
    color: ${color.text.secondary};
    word-break: keep-all;
  `,
  introTitle: css`
    ${typography.titleSection};
    letter-spacing: -0.6px;
  `,
  introLink: css`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    ${typography.bodySmallStrong};
    color: ${color.text.brand};
  `,
  section: css`
    margin-top: 30px;
  `,
  sectionTitle: css`
    margin: 0 0 12px 4px;
    ${typography.bodySmallStrong};
    color: ${color.text.secondary};
  `,
  menu: css`
    overflow: hidden;
    background: ${color.background.default};
    border: 1px solid ${color.border.default};
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
    color: ${color.text.primary};
    font: inherit;
    text-align: left;
    background: transparent;
    border: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 150ms ease;

    & + & {
      border-top: 1px solid ${color.border.default};
    }

    &:hover:not(:disabled) {
      background: ${color.background.subtle};
    }

    &:active:not(:disabled) {
      background: ${color.background.brandSubtlePressed};
    }

    &:focus-visible {
      outline: 2px solid ${color.focus.ring};
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
    color: ${color.icon.default};
    background: ${color.background.brandSubtle};
    border-radius: 13px;
  `,
  itemTitle: css`
    ${typography.label};
  `,
  itemDescription: css`
    ${typography.caption};
    color: ${color.text.secondary};
    word-break: keep-all;
  `,
  chevron: css`
    display: inline-flex;
    color: ${color.icon.default};
  `,
  installMessage: css`
    margin: 0;
    padding: 0 4px;
    ${typography.caption};
    color: ${color.text.brand};
    word-break: keep-all;

    &:not(:empty) {
      margin-top: 12px;
    }
  `,
};
