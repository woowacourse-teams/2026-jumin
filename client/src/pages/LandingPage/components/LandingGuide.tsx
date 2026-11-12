import { css, cx } from '@emotion/css';
import { useEffect, useRef, useState } from 'react';

import destination from '../../../../assets/landing/destination.webp';
import detail from '../../../../assets/landing/detail.webp';
import directions from '../../../../assets/landing/directions.webp';
import home from '../../../../assets/landing/home.webp';
import recommend from '../../../../assets/landing/recommend.webp';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';
import { EASE_OUT, HEADER_HEIGHT, landing, MOBILE } from '../landingStyles';

const steps = [
  {
    label: '찾기',
    title: ['주변을 둘러보거나,', '목적지를 검색하세요.'],
    description:
      '지도에서 주변 주차장을 한눈에 확인하세요. 무료·기계식 제외·공영 필터로 원하는 곳만 골라 볼 수 있어요.',
    image: home,
    alt: '목적지 검색창과 무료 주차장, 기계식 제외, 공영 주차장 필터가 있는 홈 화면',
  },
  {
    label: '목적지 정하기',
    title: ['도착할 위치에', '핀을 맞춰주세요.'],
    description:
      '방문할 장소를 검색한 뒤 지도를 움직여 목적지를 정하세요. 위치를 확인하고 다음을 누르면 끝이에요.',
    image: destination,
    alt: '지도에서 목적지 핀의 위치를 조정하고 선택한 목적지를 확인하는 화면',
  },
  {
    label: '비교하기',
    title: ['거리와 요금을 보고,', '내게 맞는 주차장으로.'],
    description:
      '추천 주차장 3곳을 먼저 보여드려요. 예상 요금과 도보 거리를 추천순·거리순·가격순으로 비교하세요.',
    image: recommend,
    alt: '추천 주차장 3곳의 예상 요금과 도보 거리를 추천순, 거리순, 가격순으로 비교하는 화면',
  },
  {
    label: '확인하기',
    title: ['가기 전에,', '주차 정보를 꼼꼼히.'],
    description:
      '기본요금과 추가요금, 운영시간, 주차면 수를 확인하세요. 로드뷰로 주차장 주변을 미리 볼 수 있어요.',
    image: detail,
    alt: '예상 요금과 기본·추가 요금, 도보 거리, 운영시간, 길찾기와 로드뷰 버튼이 있는 주차장 상세 화면',
  },
  {
    label: '출발하기',
    title: ['길찾기는,', '쓰던 앱 그대로.'],
    description:
      '네이버 지도·카카오맵·티맵 중 익숙한 앱을 고르면 그 앱에서 주차장까지 길찾기가 열려요.',
    image: directions,
    alt: '네이버 지도, 카카오맵, 티맵 중 길찾기 앱을 고르는 화면',
  },
] as const;

/** 화면 가운데를 지나는 단계를 현재 단계로 삼는다. */
const useActiveStep = () => {
  const listRef = useRef<HTMLOListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof IntersectionObserver !== 'function') return undefined;
    const items = Array.from(list.children);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveIndex(items.indexOf(entry.target));
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    for (const item of items) observer.observe(item);
    return () => observer.disconnect();
  }, []);

  return { listRef, activeIndex };
};

export const LandingGuide = () => {
  const { listRef, activeIndex } = useActiveStep();

  return (
    <section
      id="landing-guide"
      className={cx(landing.section, styles.guide)}
      aria-labelledby="landing-guide-title"
    >
      <div className={landing.container}>
        <header className={styles.heading} data-reveal>
          <p className={landing.eyebrow}>이용 방법</p>
          <h2 id="landing-guide-title" className={landing.title}>
            검색부터 길찾기까지,
            <br />
            이렇게 이용하세요.
          </h2>
        </header>

        <div className={styles.layout}>
          <ol ref={listRef} className={styles.steps}>
            {steps.map((step, index) => (
              <li
                key={step.label}
                className={cx(styles.step, index === activeIndex && styles.activeStep)}
              >
                <div className={styles.copy}>
                  <p className={styles.label}>
                    <span>{index + 1}</span>
                    {step.label}
                  </p>
                  <h3>
                    {step.title[0]}
                    <br />
                    {step.title[1]}
                  </h3>
                  <p className={styles.description}>{step.description}</p>
                </div>
                <div className={cx(styles.phone, styles.inlinePhone)} data-reveal>
                  <img
                    src={step.image}
                    alt={step.alt}
                    width={430}
                    height={844}
                    decoding="async"
                    loading="lazy"
                  />
                </div>
              </li>
            ))}
          </ol>

          <div className={styles.sticky}>
            <div className={styles.halo} aria-hidden="true" />
            <div
              className={cx(styles.phone, styles.stickyPhone)}
              role="img"
              aria-label={steps[activeIndex]?.alt}
            >
              {steps.map((step, index) => (
                <img
                  key={step.label}
                  className={cx(styles.layer, index === activeIndex && styles.activeLayer)}
                  src={step.image}
                  alt=""
                  width={430}
                  height={844}
                  decoding="async"
                  loading="lazy"
                />
              ))}
            </div>
            <div className={styles.progress} aria-hidden="true">
              {steps.map((step, index) => (
                <span key={step.label} className={cx(index === activeIndex && styles.activeDot)} />
              ))}
            </div>
          </div>
        </div>

        <p className={styles.note}>
          실제 서비스 화면이며, 표시된 주차장 정보와 요금은 촬영 시점 기준입니다.
        </p>
      </div>
    </section>
  );
};

/** 폰이 따라 내려오는 2단 레이아웃은 넓은 화면에서만 쓴다. */
const STACKED = '@media (max-width: 900px)';

const styles = {
  guide: css`
    background: ${color.background.default};
  `,
  heading: css`
    text-align: center;
  `,
  layout: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 64px;
    margin-top: 40px;
    ${STACKED} {
      grid-template-columns: minmax(0, 1fr);
      margin-top: 56px;
    }
  `,
  steps: css`
    margin: 0;
    padding: 0;
    list-style: none;
    ${STACKED} {
      display: grid;
      gap: 72px;
    }
  `,
  step: css`
    display: flex;
    min-height: 78vh;
    flex-direction: column;
    justify-content: center;
    opacity: 0.25;
    transition: opacity 500ms ease;
    ${STACKED} {
      min-height: 0;
      gap: 28px;
      opacity: 1;
    }
  `,
  activeStep: css`
    opacity: 1;
  `,
  copy: css`
    h3 {
      margin-top: 20px;
      font-size: clamp(1.625rem, 3.2vw, 2.5rem);
      font-weight: 800;
      line-height: 1.35;
      letter-spacing: -0.03em;
    }
  `,
  label: css`
    display: flex;
    align-items: center;
    gap: 10px;
    ${typography.label};
    font-size: 1rem;
    color: ${color.text.brand};
    span {
      display: grid;
      width: 28px;
      height: 28px;
      place-items: center;
      border-radius: 9px;
      background: ${color.background.brand};
      color: ${color.text.inverse};
      font-size: 0.875rem;
      font-variant-numeric: tabular-nums;
    }
  `,
  description: css`
    max-width: 420px;
    margin-top: 16px !important;
    font-size: 1.0625rem;
    line-height: 1.75;
    color: ${color.text.secondary};
    ${MOBILE} {
      font-size: 1rem;
    }
  `,
  sticky: css`
    position: sticky;
    top: calc(${HEADER_HEIGHT}px + (100dvh - ${HEADER_HEIGHT}px - min(640px, 72dvh)) / 2);
    display: flex;
    height: min(640px, 72dvh);
    align-self: start;
    align-items: center;
    justify-content: center;
    gap: 28px;
    margin: 9vh 0;
    ${STACKED} {
      display: none;
    }
  `,
  halo: css`
    position: absolute;
    inset: 4% 8%;
    border-radius: 48px;
    background: linear-gradient(
      160deg,
      ${color.background.brandSubtle},
      ${color.border.brandSubtle}
    );
  `,
  phone: css`
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    border: 8px solid ${color.background.inverse};
    border-radius: 40px;
    background: ${color.background.subtle};
    box-shadow: 0 40px 70px -36px rgb(16 27 55 / 55%);
    aspect-ratio: 446 / 860;
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
  stickyPhone: css`
    height: 100%;
  `,
  inlinePhone: css`
    display: none;
    width: min(100%, 300px);
    margin: 0 auto;
    ${STACKED} {
      display: block;
    }
  `,
  layer: css`
    position: absolute;
    inset: 0;
    opacity: 0;
    transform: scale(1.04);
    transition:
      opacity 500ms ease,
      transform 800ms ${EASE_OUT};
  `,
  activeLayer: css`
    opacity: 1;
    transform: scale(1);
  `,
  progress: css`
    position: relative;
    display: grid;
    gap: 8px;
    span {
      width: 6px;
      height: 6px;
      border-radius: 3px;
      background: ${color.background.muted};
      transition:
        height 400ms ${EASE_OUT},
        background 300ms ease;
    }
  `,
  activeDot: css`
    height: 28px !important;
    background: ${color.background.brand} !important;
  `,
  note: css`
    margin-top: 48px !important;
    ${typography.caption};
    color: ${color.text.secondary};
    text-align: center;
  `,
};
