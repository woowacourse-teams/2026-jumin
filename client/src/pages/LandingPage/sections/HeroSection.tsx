import { css, cx } from '@emotion/css';
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router';

import { ArrowDownIcon, ChevronRightIcon } from '../../../shared/components/ui/icons';
import { Row } from '../../../shared/components/ui/Row';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';
import { HeroMapAnimation } from '../components/HeroMapAnimation';
import { EASE_OUT, HEADER_HEIGHT, landing, MOBILE, REDUCE_MOTION, TABLET } from '../landingStyles';

/** 포인터가 화면 끝에 있을 때 폰이 기우는 최대 각도(deg). */
const MAX_TILT = 7;

const delay = (ms: number) => ({ '--enter-delay': `${ms}ms` }) as CSSProperties;

export const HeroSection = () => {
  const sectionRef = useRef<HTMLElement>(null);

  /** 마우스 위치를 따라 배경 조명이 움직이고 폰이 살짝 기운다. 터치에서는 쓰지 않는다. */
  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const section = sectionRef.current;
    if (!section || event.pointerType !== 'mouse') return;
    const bounds = section.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    section.style.setProperty('--pointer-x', `${(x * 100).toFixed(1)}%`);
    section.style.setProperty('--pointer-y', `${(y * 100).toFixed(1)}%`);
    section.style.setProperty('--tilt-y', `${((x - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
    section.style.setProperty('--tilt-x', `${((0.5 - y) * 2 * MAX_TILT).toFixed(2)}deg`);
  };

  const handlePointerLeave = () => {
    const section = sectionRef.current;
    if (!section) return;
    section.style.removeProperty('--tilt-x');
    section.style.removeProperty('--tilt-y');
  };

  return (
    <section
      ref={sectionRef}
      className={styles.hero}
      aria-labelledby="landing-title"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className={styles.spotlight} aria-hidden="true" />
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={cx(styles.pill, styles.enter)}>
            <span />
            목적지 주변 주차장 비교
          </p>
          <h1 id="landing-title">
            <span className={styles.line}>
              <span className={styles.enter} style={delay(80)}>
                목적지는 정했는데,
              </span>
            </span>
            <br />
            <span className={styles.line}>
              <span className={cx(styles.enter, styles.accent)} style={delay(200)}>
                주차는 어디에 하지?
              </span>
            </span>
          </h1>
          <p className={cx(styles.description, styles.enter)} style={delay(340)}>
            주차의민족이 목적지에서 가깝고 <br />
            요금이 합리적인 주차장을 찾아드려요.
          </p>
          <Row
            align="center"
            gap={24}
            className={cx(styles.actions, styles.enter)}
            style={delay(460)}
          >
            <Link className={cx(landing.button, landing.primaryButton)} to="/">
              주차장 찾아보기 <ChevronRightIcon size={18} aria-hidden="true" />
            </Link>
            <a className={styles.textLink} href="#landing-guide">
              이용 방법 보기 <ArrowDownIcon size={16} aria-hidden="true" />
            </a>
          </Row>
          <p className={cx(styles.note, styles.enter)} style={delay(560)}>
            설치 없이 웹에서 바로 쓸 수 있어요.
          </p>
        </div>
        <div className={cx(styles.demo, styles.enter)} style={delay(260)}>
          <HeroMapAnimation />
        </div>
      </div>
    </section>
  );
};

const styles = {
  hero: css`
    --pointer-x: 70%;
    --pointer-y: 40%;
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(60% 50% at 85% 10%, ${color.background.brandSubtleHovered}, transparent 70%),
      linear-gradient(180deg, ${color.background.default} 0%, ${color.background.brandSubtle} 100%);
  `,
  spotlight: css`
    position: absolute;
    inset: 0;
    background: radial-gradient(
      520px circle at var(--pointer-x) var(--pointer-y),
      rgb(67 86 216 / 14%),
      transparent 70%
    );
    pointer-events: none;
    ${MOBILE} {
      display: none;
    }
  `,
  inner: css`
    ${landing.container};
    position: relative;
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    align-items: center;
    gap: 64px;
    box-sizing: border-box;
    /* 처음 들어왔을 때 히어로 전체가 한 화면에 보이게 한다. */
    min-height: calc(100dvh - ${HEADER_HEIGHT}px);
    padding: clamp(16px, 3dvh, 40px) 0;
    ${TABLET} {
      gap: 32px;
    }
    ${MOBILE} {
      grid-template-columns: 1fr;
      gap: 40px;
      min-height: 0;
      padding: 40px 0 72px;
    }
  `,
  /* 아래에서 떠오르며 나타난다. 순서는 --enter-delay로 정한다. */
  enter: css`
    animation: landing-hero-enter 1000ms ${EASE_OUT} var(--enter-delay, 0ms) both;
    @keyframes landing-hero-enter {
      from {
        opacity: 0;
        transform: translateY(28px);
      }
    }
    ${REDUCE_MOTION} {
      animation: none;
    }
  `,
  copy: css`
    h1 {
      margin-top: 20px;
      font-size: clamp(2.25rem, 5vw, 4.25rem);
      line-height: 1.22;
      font-weight: 800;
      letter-spacing: -0.04em;
    }
    ${MOBILE} {
      h1 {
        font-size: clamp(2rem, 9.4vw, 2.75rem);
      }
    }
  `,
  line: css`
    display: inline-block;
    > span {
      display: inline-block;
    }
  `,
  accent: css`
    background: linear-gradient(100deg, ${color.text.brand} 20%, #7b8bf2 60%, ${color.text.brand});
    background-size: 200% 100%;
    background-clip: text;
    color: transparent;
    animation:
      landing-hero-enter 1000ms ${EASE_OUT} var(--enter-delay, 0ms) both,
      landing-hero-shine 6s linear 1.2s infinite;
    @keyframes landing-hero-shine {
      to {
        background-position: -200% 0;
      }
    }
    ${REDUCE_MOTION} {
      animation: none;
    }
  `,
  pill: css`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 999px;
    background: ${color.background.default};
    box-shadow: 0 6px 20px -10px rgb(67 86 216 / 50%);
    ${typography.label};
    color: ${color.text.brand};
    span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${color.background.brand};
      box-shadow: 0 0 0 4px ${color.background.brandSubtleHovered};
    }
  `,
  description: css`
    margin-top: 24px !important;
    font-size: clamp(1rem, 1.6vw, 1.25rem);
    font-weight: 500;
    line-height: 1.7;
    color: ${color.text.secondary};
    ${TABLET} {
      br {
        display: none;
      }
    }
  `,
  actions: css`
    flex-wrap: wrap;
    margin-top: 36px;
  `,
  textLink: css`
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    gap: 6px;
    ${typography.label};
    font-size: 1rem;
    svg {
      transition: transform 300ms ${EASE_OUT};
    }
    &:hover {
      color: ${color.text.brand};
      svg {
        transform: translateY(3px);
      }
    }
  `,
  note: css`
    margin-top: 16px !important;
    ${typography.caption};
    color: ${color.text.secondary};
  `,
  demo: css``,
};
