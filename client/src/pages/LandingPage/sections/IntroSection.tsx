import { css, cx } from '@emotion/css';
import { type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

import {
  DirectionsIcon,
  FreeParkingIcon,
  MechanicalParkingIcon,
  PublicParkingIcon,
  RoadViewIcon,
} from '../../../shared/components/ui/icons';
import { color } from '../../../theme/color';
import { palette } from '../../../theme/palette';
import { typography } from '../../../theme/typography';
import { landing, MOBILE, TABLET } from '../landingStyles';

/** 포인터 위치를 --spot-x/--spot-y로 넘겨 카드 위에 은은한 조명이 따라다니게 한다. */
const followPointer = (event: ReactPointerEvent<HTMLElement>) => {
  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  card.style.setProperty('--spot-x', `${event.clientX - bounds.left}px`);
  card.style.setProperty('--spot-y', `${event.clientY - bounds.top}px`);
};

const mapApps = [
  { name: '네이버 지도', ...color.mapProvider.naver },
  { name: '카카오맵', ...color.mapProvider.kakao },
  { name: '티맵', ...color.mapProvider.tmap },
] as const;

export const IntroSection = () => {
  return (
    <section
      id="landing-intro"
      className={cx(landing.section, styles.section)}
      aria-labelledby="landing-intro-title"
    >
      <div className={landing.container}>
        <header className={styles.heading} data-reveal>
          <p className={landing.eyebrow}>서비스 소개</p>
          <h2 id="landing-intro-title" className={landing.title}>
            주차장을 찾는 기준은,
            <br />
            사람마다 다르니까.
          </h2>
          <p className={landing.lead}>
            가까운 곳이 좋은 날도, 저렴한 곳이 좋은 날도 있죠.
            <br />내 조건에 맞는 주차장을 고를 수 있게 도와드려요.
          </p>
        </header>

        <div className={styles.features}>
          <article className={styles.feature} onPointerMove={followPointer} data-reveal>
            <div className={styles.featureVisual} aria-hidden="true">
              <span className={styles.chip}>
                <FreeParkingIcon size={18} color={color.parkingFilter.freeOnly.icon} />
                무료 주차장
              </span>
              <span className={cx(styles.chip, styles.chipSelected)}>
                <MechanicalParkingIcon size={18} />
                기계식 제외
              </span>
              <span className={styles.chip}>
                <PublicParkingIcon size={18} color={color.parkingFilter.isPublic.icon} />
                공영 주차장
              </span>
            </div>
            <h3>원하는 조건만 골라서</h3>
            <p>무료 주차장, 기계식 제외, 공영 주차장. 필요한 조건으로 후보를 좁혀 보세요.</p>
          </article>

          <article
            className={styles.feature}
            onPointerMove={followPointer}
            data-reveal
            style={{ '--reveal-delay': '120ms' } as CSSProperties}
          >
            <div className={cx(styles.featureVisual, styles.detailVisual)} aria-hidden="true">
              <div className={styles.detailFee}>
                <span>1시간 예상 요금</span>
                <strong>4,000원</strong>
              </div>
              <div className={styles.detailRow}>
                <span>운영시간</span>
                <b>평일 08:00 – 20:00</b>
              </div>
              <span className={styles.roadView}>
                <RoadViewIcon size={16} />
                로드뷰
              </span>
            </div>
            <h3>가기 전에 미리 확인하고</h3>
            <p>예상 요금과 운영시간, 주차면 수를 보고 로드뷰로 주변 모습도 살펴보세요.</p>
          </article>

          <article
            className={styles.feature}
            onPointerMove={followPointer}
            data-reveal
            style={{ '--reveal-delay': '240ms' } as CSSProperties}
          >
            <div className={cx(styles.featureVisual, styles.appVisual)} aria-hidden="true">
              {mapApps.map((app, index) => (
                <span
                  key={app.name}
                  className={styles.appChip}
                  style={
                    {
                      '--app-bg': app.background,
                      '--app-fg': app.foreground,
                      '--float-delay': `${index * -1.3}s`,
                    } as CSSProperties
                  }
                >
                  {app.name}
                </span>
              ))}
              <span className={styles.directions}>
                <DirectionsIcon size={18} />
                길찾기
              </span>
            </div>
            <h3>쓰던 지도 앱으로 출발</h3>
            <p>네이버 지도, 카카오맵, 티맵. 익숙한 앱으로 길 안내를 바로 이어가세요.</p>
          </article>
        </div>
      </div>
    </section>
  );
};

const styles = {
  section: css`
    background: ${color.background.subtle};
  `,
  heading: css`
    text-align: center;
  `,
  features: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
    margin-top: 72px;
    ${TABLET} {
      grid-template-columns: minmax(0, 1fr);
    }
    ${MOBILE} {
      margin-top: 48px;
    }
  `,
  feature: css`
    --spot-x: 50%;
    --spot-y: 0%;
    position: relative;
    overflow: hidden;
    padding: 28px;
    border-radius: 32px;
    background: ${color.background.default};
    box-shadow: 0 2px 6px rgb(16 27 55 / 4%);
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(
        320px circle at var(--spot-x) var(--spot-y),
        rgb(67 86 216 / 10%),
        transparent 70%
      );
      opacity: 0;
      transition: opacity 400ms ease;
      pointer-events: none;
    }
    &:hover::before {
      opacity: 1;
    }
    h3 {
      position: relative;
      margin-top: 28px;
      font-size: 1.375rem;
      font-weight: 800;
      line-height: 1.4;
      letter-spacing: -0.02em;
    }
    p {
      position: relative;
      margin-top: 10px;
      ${typography.body};
      line-height: 1.7;
      color: ${color.text.secondary};
    }
    ${MOBILE} {
      padding: 20px;
      border-radius: 24px;
    }
  `,
  featureVisual: css`
    position: relative;
    display: flex;
    height: 168px;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 10px;
    padding: 0 20px;
    border-radius: 20px;
    background: ${color.background.subtle};
  `,
  chip: css`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border: 1.5px solid transparent;
    border-radius: 999px;
    background: ${color.background.default};
    box-shadow: 0 4px 12px -6px rgb(16 27 55 / 30%);
    ${typography.label};
  `,
  chipSelected: css`
    margin-left: 28px;
    border-color: ${color.border.selected};
    color: ${color.text.selected};
  `,
  detailVisual: css`
    align-items: stretch;
    gap: 12px;
  `,
  detailFee: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-radius: 14px;
    background: ${color.background.brandSubtle};
    ${typography.label};
    strong {
      font-size: 1.125rem;
      font-weight: 800;
      color: ${color.text.brand};
    }
  `,
  detailRow: css`
    display: flex;
    justify-content: space-between;
    padding: 0 4px;
    ${typography.bodySmall};
    color: ${color.text.secondary};
    b {
      color: ${color.text.primary};
    }
  `,
  roadView: css`
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: 1px solid ${color.border.brandSubtle};
    border-radius: 12px;
    background: ${color.background.default};
    ${typography.label};
    color: ${color.text.brand};
  `,
  appVisual: css`
    flex-flow: row wrap;
    align-content: center;
    align-items: center;
    justify-content: center;
    gap: 8px;
  `,
  appChip: css`
    padding: 10px 14px;
    border-radius: 14px;
    background: var(--app-bg);
    color: var(--app-fg);
    ${typography.label};
    font-weight: 800;
    box-shadow: 0 8px 16px -10px rgb(16 27 55 / 40%);
    animation: landing-chip-float 4s ease-in-out var(--float-delay) infinite;
    @keyframes landing-chip-float {
      0%,
      100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-6px);
      }
    }
  `,
  directions: css`
    display: inline-flex;
    width: 100%;
    max-width: 200px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 14px;
    background: ${palette.blue500};
    ${typography.label};
    color: ${color.text.inverse};
  `,
};
