import { css } from '@emotion/css';
import { useEffect, useRef, useState } from 'react';

import home from '../../../../assets/landing/home.png';
import destination from '../../../../assets/landing/destination.png';
import recommend from '../../../../assets/landing/recommend.png';
import detail from '../../../../assets/landing/detail.png';

const SLIDE_INTERVAL = 5_000;

// 원본 캡처는 보존하고, 회색 바깥 여백을 제외한 860 × 1688 영역만 표시한다.
const steps = [
  {
    label: '목적지 검색',
    title: ['어디에 가세요?', '검색부터 시작하세요.'],
    description: '홈 화면에서 방문할 장소를 검색하세요. 지도에서 주변 주차장도 확인할 수 있어요.',
    image: home,
    alt: '검색창과 주변 주차장이 표시된 실제 홈 화면',
    width: 1050,
    height: 1794,
    x: 105,
    y: 68,
  },
  {
    label: '목적지 정하기',
    title: ['가고 싶은 곳에', '핀을 맞춰주세요.'],
    description: '지도를 움직여 도착할 위치를 정하세요. 목적지를 확인하고 다음 버튼을 누르면 돼요.',
    image: destination,
    alt: '양재시민의숲에 목적지 핀을 맞춘 실제 목적지 설정 화면',
    width: 946,
    height: 1766,
    x: 43,
    y: 38,
  },
  {
    label: '주차장 추천받기',
    title: ['거리와 요금을 비교해', '내게 맞는 주차장으로.'],
    description:
      '목적지 주변 주차장을 거리순·가격순·균형순으로 비교하세요. 이용 시간도 바꿀 수 있어요.',
    image: recommend,
    alt: '목적지 주변 지도와 예상 요금, 도보 거리를 보여주는 실제 추천 화면',
    width: 984,
    height: 1786,
    x: 53,
    y: 44,
  },
  {
    label: '상세정보 · 길찾기',
    title: ['주차 정보를 확인하고,', '길찾기로 출발하세요.'],
    description: '예상 요금과 운영시간을 확인하세요. 선택한 주차장까지 길찾기로 이어갈 수 있어요.',
    image: detail,
    alt: '예상 요금, 운영시간과 길찾기 버튼이 표시된 실제 주차장 상세 화면',
    width: 1008,
    height: 1816,
    x: 73,
    y: 64,
  },
] as const;

export const LandingGuide = () => {
  const guideRef = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const playing = visible && !hovered && !focused && !hidden && !reducedMotion;
  const step = steps[index]!;

  useEffect(() => {
    const guide = guideRef.current;
    if (!guide || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.15)),
      { threshold: 0.15 },
    );
    observer.observe(guide);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const handleMotion = () => setReducedMotion(media?.matches ?? false);
    const handleVisibility = () => setHidden(document.hidden);
    media?.addEventListener('change', handleMotion);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      media?.removeEventListener('change', handleMotion);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % steps.length),
      SLIDE_INTERVAL,
    );
    return () => window.clearTimeout(timer);
  }, [index, playing]);

  return (
    <section
      ref={guideRef}
      id="landing-guide"
      className={styles.guide}
      aria-label="주차의민족 이용 방법"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>
            HOW TO USE <span>목적지 검색부터 길찾기까지</span>
          </p>
          <nav className={styles.steps} aria-label="이용 방법 단계 선택">
            {steps.map((item, stepIndex) => (
              <button
                key={item.label}
                type="button"
                aria-current={index === stepIndex ? 'step' : undefined}
                onClick={() => setIndex(stepIndex)}
              >
                <span>{String(stepIndex + 1).padStart(2, '0')}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <div
            className={styles.explanation}
            aria-live={playing ? 'off' : 'polite'}
            aria-atomic="true"
          >
            <p className={styles.label}>{step.label}</p>
            <h2>
              {step.title[0]}
              <br />
              {step.title[1]}
            </h2>
            <p className={styles.description}>{step.description}</p>
          </div>
        </div>
        <figure className={styles.preview}>
          <div className={styles.phone}>
            <div className={styles.screen}>
              <img
                src={step.image}
                alt={step.alt}
                width={step.width}
                height={step.height}
                decoding="async"
                loading="lazy"
                style={{
                  width: `${(step.width / 860) * 100}%`,
                  height: `${(step.height / 1688) * 100}%`,
                  left: `${(-step.x / 860) * 100}%`,
                  top: `${(-step.y / 1688) * 100}%`,
                }}
              />
            </div>
          </div>
          <figcaption>
            <span aria-hidden="true" />
            실제 서비스 이용 화면
          </figcaption>
        </figure>
      </div>
    </section>
  );
};

const styles = {
  guide: css`
    padding: 72px 40px 88px;
    scroll-margin-top: 20px;
    background: #f5f6fc;
    @media (max-width: 700px) {
      padding: 48px 24px;
    }
  `,
  inner: css`
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    align-items: center;
    gap: 56px;
    max-width: 1128px;
    margin: 0 auto;
    @media (max-width: 900px) {
      gap: 28px;
    }
    @media (max-width: 700px) {
      grid-template-columns: 1fr;
      gap: 32px;
    }
  `,
  copy: css`
    min-width: 0;
  `,
  eyebrow: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px 14px;
    color: var(--landing-primary);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1.5px;
    span {
      color: #7a8297;
      font-weight: 500;
      letter-spacing: -0.3px;
    }
  `,
  steps: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 28px 0 40px;
    button {
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 44px;
      padding: 10px 12px;
      border: 1px solid #e0e4f0;
      border-radius: 10px;
      color: #667086;
      background: transparent;
      font-size: 13px;
      text-align: left;
      cursor: pointer;
    }
    button[aria-current='step'] {
      color: #4356d8;
      border-color: #4356d8;
      background: #fff;
      font-weight: 700;
    }
    span {
      font-size: 11px;
      font-weight: 700;
      opacity: 0.65;
    }
    @media (max-width: 700px) {
      margin: 24px 0 28px;
    }
  `,
  explanation: css`
    min-height: 240px;
    h2 {
      margin: 14px 0 20px;
      font-size: clamp(28px, 3.1vw, 42px);
      font-weight: 800;
      line-height: 1.4;
      letter-spacing: -1.6px;
    }
    @media (max-width: 900px) {
      h2 {
        font-size: 30px;
      }
    }
    @media (max-width: 700px) {
      min-height: 204px;
      h2 {
        font-size: clamp(25px, 6.6vw, 34px);
        letter-spacing: -1px;
      }
    }
  `,
  label: css`
    color: var(--landing-primary);
    font-size: 14px;
    font-weight: 700;
  `,
  description: css`
    max-width: 420px;
    color: #667086;
    font-size: 16px;
    line-height: 1.85;
  `,
  preview: css`
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    &::before {
      content: '';
      position: absolute;
      top: 16%;
      left: 0;
      width: 100%;
      aspect-ratio: 1;
      border-radius: 50%;
      background: #e4e8fc;
    }
    figcaption {
      display: flex;
      align-items: center;
      gap: 6px;
      z-index: 1;
      color: #7a8297;
      font-size: 11px;
    }
    figcaption span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #4356d8;
    }
  `,
  phone: css`
    position: relative;
    width: min(100%, 312px);
    padding: 7px;
    border: 1px solid #e0e4f0;
    border-radius: 31px;
    background: #fff;
    box-shadow: 0 24px 48px -16px rgb(35 49 104 / 25%);
    @media (max-width: 700px) {
      width: min(100%, 280px);
    }
  `,
  screen: css`
    position: relative;
    width: 100%;
    aspect-ratio: 430 / 844;
    overflow: hidden;
    border-radius: 24px;
    img {
      position: absolute;
      display: block;
      max-width: none;
    }
  `,
};
