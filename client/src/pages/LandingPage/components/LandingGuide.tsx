import { css } from '@emotion/css';
import { useEffect, useRef } from 'react';

import home from '../../../../assets/landing/home.png';
import destination from '../../../../assets/landing/destination.png';
import recommend from '../../../../assets/landing/recommend.png';
import detail from '../../../../assets/landing/detail.png';
import { color } from '../../../theme/color';
import { fontSize, fontWeight, lineHeight } from '../../../theme/font';
import { typography } from '../../../theme/typography';

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

  useEffect(() => {
    const guide = guideRef.current;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!guide || typeof IntersectionObserver === 'undefined' || motion?.matches) return;

    const sections = Array.from(guide.querySelectorAll<HTMLElement>('[data-guide-step]'));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.12) continue;
          entry.target.setAttribute('data-reveal', 'visible');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -48px 0px' },
    );
    sections.forEach((section) => {
      section.dataset.reveal = 'pending';
      observer.observe(section);
    });

    const handleMotion = () => {
      if (!motion?.matches) return;
      sections.forEach((section) => {
        section.dataset.reveal = 'visible';
      });
      observer.disconnect();
    };
    motion?.addEventListener('change', handleMotion);
    return () => {
      observer.disconnect();
      motion?.removeEventListener('change', handleMotion);
      sections.forEach((section) => {
        delete section.dataset.reveal;
      });
    };
  }, []);

  return (
    <section
      ref={guideRef}
      id="landing-guide"
      className={styles.guide}
      aria-label="주차의민족 이용 방법"
    >
      <div className={styles.content}>
        <p className={styles.eyebrow}>
          HOW TO USE <span>목적지 검색부터 길찾기까지</span>
        </p>
        {steps.map((step, index) => (
          <section
            key={step.label}
            className={styles.step}
            data-guide-step
            aria-labelledby={`landing-guide-step-${index + 1}`}
          >
            <div className={styles.copy}>
              <p className={styles.label}>
                <span>STEP {String(index + 1).padStart(2, '0')}</span>
                {step.label}
              </p>
              <h2 id={`landing-guide-step-${index + 1}`}>
                {step.title[0]}
                <br />
                {step.title[1]}
              </h2>
              <p className={styles.description}>{step.description}</p>
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
          </section>
        ))}
      </div>
    </section>
  );
};

const styles = {
  guide: css`
    padding: 72px 40px 88px;
    scroll-margin-top: 20px;
    background: ${color.background.subtle};
    @media (max-width: 700px) {
      padding: 48px 24px;
    }
  `,
  content: css`
    max-width: 1128px;
    margin: 0 auto;
  `,
  step: css`
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    align-items: center;
    gap: 56px;
    padding: 64px 0;
    border-bottom: 1px solid ${color.border.default};
    &:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    &:nth-of-type(even) {
      > div {
        order: 2;
      }
      > figure {
        order: 1;
      }
    }
    &[data-reveal='pending'] {
      opacity: 0;
      transform: translateY(36px);
    }
    &[data-reveal='visible'] {
      animation: landing-step-reveal 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes landing-step-reveal {
      from {
        opacity: 0;
        transform: translateY(36px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @media (max-width: 900px) {
      gap: 28px;
    }
    @media (max-width: 700px) {
      grid-template-columns: 1fr;
      gap: 32px;
      padding: 48px 0;
      &:nth-of-type(even) {
        > div,
        > figure {
          order: initial;
        }
      }
    }
    @media (prefers-reduced-motion: reduce) {
      &[data-reveal] {
        opacity: 1;
        transform: none;
        animation: none;
      }
    }
  `,
  copy: css`
    min-width: 0;
    h2 {
      margin: 20px 0;
      ${typography.titlePage};
      font-size: clamp(1.75rem, 3.1vw, 2.625rem);
      line-height: ${lineHeight[140]};
      letter-spacing: -1.6px;
    }
    @media (max-width: 900px) {
      h2 {
        font-size: ${fontSize[30]};
      }
    }
    @media (max-width: 700px) {
      h2 {
        font-size: clamp(1.5625rem, 6.6vw, 2.125rem);
        letter-spacing: -1px;
      }
    }
  `,
  eyebrow: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px 14px;
    color: var(--landing-primary);
    ${typography.caption};
    font-weight: ${fontWeight[800]};
    letter-spacing: 1.5px;
    span {
      color: ${color.text.secondary};
      font-weight: ${fontWeight[400]};
      letter-spacing: -0.3px;
    }
  `,
  label: css`
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--landing-primary);
    ${typography.label};
    span {
      padding: 6px 10px;
      border-radius: 6px;
      background: ${color.background.brandSubtle};
      font-size: ${fontSize[12]};
      letter-spacing: 1px;
    }
  `,
  description: css`
    max-width: 420px;
    ${typography.body};
    color: ${color.text.secondary};
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
      background: ${color.background.brandSubtle};
    }
    figcaption {
      display: flex;
      align-items: center;
      gap: 6px;
      z-index: 1;
      ${typography.caption};
      color: ${color.text.secondary};
    }
    figcaption span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${color.background.brand};
    }
  `,
  phone: css`
    position: relative;
    width: min(100%, 312px);
    padding: 7px;
    border: 1px solid ${color.border.default};
    border-radius: 31px;
    background: ${color.background.default};
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
