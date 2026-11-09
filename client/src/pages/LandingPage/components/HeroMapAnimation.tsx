import { css, cx, keyframes } from '@emotion/css';
import { useEffect, useRef, type CSSProperties } from 'react';

import dotMarker from '../../../../assets/icons/markers/dotParkingMarker.svg';
import parkingMarker from '../../../../assets/icons/markers/homeParkingMarker.svg';
import destinationScreen from '../../../../assets/landing/destination.webp';
import { color } from '../../../theme/color';
import { palette } from '../../../theme/palette';
import { MOBILE, TABLET } from '../landingStyles';

/**
 * 한 바퀴 길이(초). 키프레임 퍼센트는 at(초)로 이 길이에 맞춰 계산한다.
 * 0.3~2.3초: 가격 핀 100여 개가 지도를 뒤덮음 → 2.9~3.7초: 목적지에서 반경 원이 퍼지며 핀이 날아감
 * → 3.9~4.5초: 원 안에 남은 3곳이 추천으로 강조됨 → 5.1~5.6초: 추천 정보 카드가 떠오름 → 9.9초~: 처음으로
 */
const CYCLE_SECONDS = 11;
const CYCLE = `${CYCLE_SECONDS}s`;
const at = (seconds: number) => `${((seconds / CYCLE_SECONDS) * 100).toFixed(2)}%`;

/** 실제 앱 스크린샷(430×844) 비율에 맞춘 화면 크기(px). */
const SCREEN = { width: 282, height: 554 };
const BEZEL = 10;
/** 스크린샷 위에 얹는 상태 표시줄 높이(px). 다이내믹 아일랜드가 앱 화면을 가리지 않게 한다. */
const STATUS_BAR = 30;
const PHONE = {
  width: SCREEN.width + BEZEL * 2,
  height: SCREEN.height + STATUS_BAR + BEZEL * 2,
  radius: 50,
};
/** 폰과 떠 있는 카드가 들어가는 무대 높이(px). 실제 크기는 --scene-scale을 곱한 값이다. */
const STAGE_HEIGHT = 620;
/** 랜딩 상단 헤더 높이(px). 첫 화면에서 히어로가 쓸 수 있는 높이를 계산할 때 뺀다. */
const HEADER_HEIGHT = 100;
/** 화면 높이에 맞춘 배율의 하한·상한. 너무 작아지거나 큰 화면에서 과하게 커지지 않게 한다. */
const HEIGHT_SCALE = { min: 0.62, max: 1.12 };
/** 핸드폰 두께를 만드는 층 수와 층 간격(px). */
const BODY_LAYERS = 10;
const LAYER_GAP = 1.2;

/** 반경 원의 중심(화면 %). 목적지 화면 스크린샷의 빨간 핀 끝에 맞춘다. */
const RADIUS_CENTER = { x: 49.9, y: 49.4 };

/**
 * 원이 퍼진 뒤에도 남는 핀(화면 %). 처음엔 다른 가격 핀과 섞여 있다가 앱의 추천 P 마커로 바뀐다.
 * 1위 가격은 떠오르는 요금 카드와 맞춘다.
 */
const recommendations = [
  { rank: 1, x: 44, y: 44, price: '7,500' },
  { rank: 2, x: 61, y: 55, price: '6,000' },
  { rank: 3, x: 56, y: 37, price: '5,400' },
] as const;

/** 원 안에 함께 보이는 일반 주차장 점(화면 %). 앱 추천 화면처럼 추천이 아닌 곳은 작은 점으로 남는다. */
const candidateDots = [
  { x: 38, y: 40 },
  { x: 51, y: 36 },
  { x: 66, y: 41 },
  { x: 69, y: 49 },
  { x: 35, y: 52 },
  { x: 42, y: 59 },
  { x: 53, y: 62 },
  { x: 65, y: 60 },
  { x: 58, y: 47 },
  { x: 45, y: 56 },
  { x: 33, y: 46 },
  { x: 60, y: 33 },
];

/** 다른 지도 앱처럼 가격만 빽빽하게 찍힌 핀. 지도 영역(검색창 아래 ~ 하단 시트 위)에만 찍는다. 위치는 고정 시드로 매번 같게 뽑는다. */
const PRICES = [
  '3,000',
  '5,000',
  '5,400',
  '6,000',
  '7,200',
  '8,160',
  '8,400',
  '8,700',
  '9,000',
  '12,000',
  '4,000',
  '2,400',
  '10,800',
  '7,440',
];
const BUBBLE_GRID = { columns: 8, rows: 15 };

const seededRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const priceBubbles = (() => {
  const random = seededRandom(20261103);
  const bubbles = [];
  for (let row = 0; row < BUBBLE_GRID.rows; row += 1) {
    for (let column = 0; column < BUBBLE_GRID.columns; column += 1) {
      if (random() < 0.12) continue;
      const x = 8 + ((column + 0.2 + random() * 0.6) / BUBBLE_GRID.columns) * 86;
      const y = 14 + ((row + 0.2 + random() * 0.6) / BUBBLE_GRID.rows) * 60;
      const dx = x - RADIUS_CENTER.x;
      const dy = y - RADIUS_CENTER.y;
      const distance = Math.hypot(dx, dy) || 1;
      bubbles.push({
        id: `${row}-${column}`,
        x,
        y,
        price: PRICES[Math.floor(random() * PRICES.length)] ?? '5,000',
        popDelay: 0.3 + random() * 1.8,
        leaveDelay: distance / 120,
        pushX: (dx / distance) * 70,
        pushY: (dy / distance) * 70,
      });
    }
  }
  return bubbles;
})();

const mapApps = [
  { name: '네이버 지도', ...color.mapProvider.naver },
  { name: '카카오맵', ...color.mapProvider.kakao },
  { name: '티맵', ...color.mapProvider.tmap },
] as const;

const sideButtons = [
  { side: 'left', top: 118, height: 30 },
  { side: 'left', top: 162, height: 52 },
  { side: 'left', top: 224, height: 52 },
  { side: 'right', top: 176, height: 78 },
] as const;

/** 뒷면에 가까운 층일수록 어둡게 칠해 금속 테두리의 입체감을 만든다. */
const bodyLayerColor = (index: number) => {
  if (index === BODY_LAYERS - 1) return '#2B3346';
  if (index < 3) return '#9AA3B5';
  return '#5D667B';
};

/**
 * 첫 화면에서 히어로가 다 보이도록, 남는 세로 공간에 들어가는 가장 큰 배율을 --height-scale로 넣는다.
 * 한 줄로 쌓이는 모바일에서는 스크롤하므로 너비 배율만 쓴다.
 */
const useFitToViewportHeight = () => {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const mobile = window.matchMedia('(max-width: 700px)');

    const update = () => {
      if (mobile.matches) {
        stage.style.removeProperty('--height-scale');
        return;
      }
      const heroInner = stage.closest('section')?.firstElementChild;
      const padding = heroInner
        ? parseFloat(getComputedStyle(heroInner).paddingTop) +
          parseFloat(getComputedStyle(heroInner).paddingBottom)
        : 0;
      const available = window.innerHeight - HEADER_HEIGHT - padding;
      const scale = Math.min(
        HEIGHT_SCALE.max,
        Math.max(HEIGHT_SCALE.min, available / STAGE_HEIGHT),
      );
      stage.style.setProperty('--height-scale', scale.toFixed(3));
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return stageRef;
};

export const HeroMapAnimation = () => {
  const stageRef = useFitToViewportHeight();

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      role="img"
      aria-label="가격 핀 100여 개가 빽빽한 지도에서 목적지를 중심으로 반경 원이 퍼지며 핀이 사라지고, 추천 주차장 3곳만 남은 뒤 도보 거리와 예상 요금, 길찾기 앱 선택지가 보이는 화면"
    >
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.floorShadow} aria-hidden="true" />

      <div className={styles.float} aria-hidden="true">
        <div className={styles.phone}>
          {Array.from({ length: BODY_LAYERS }, (_, index) => (
            <span
              key={index}
              className={styles.bodyLayer}
              style={{
                transform: `translateZ(${-(index + 1) * LAYER_GAP}px)`,
                background: bodyLayerColor(index),
              }}
            />
          ))}
          {sideButtons.map((button) => (
            <span
              key={`${button.side}-${button.top}`}
              className={cx(styles.sideButton, button.side === 'left' ? styles.left : styles.right)}
              style={{ top: button.top, height: button.height }}
            />
          ))}

          <div className={styles.frame}>
            <div className={styles.screen}>
              <div className={styles.statusBar}>
                <span>9:41</span>
                <span className={styles.statusIcons}>
                  <svg viewBox="0 0 18 12" aria-hidden="true">
                    <rect x="0" y="8" width="3" height="4" rx="1" />
                    <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                    <rect x="10" y="3" width="3" height="9" rx="1" />
                    <rect x="15" y="0" width="3" height="12" rx="1" />
                  </svg>
                  <span className={styles.battery} />
                </span>
              </div>
              <div className={styles.content}>
                <img
                  className={styles.screenImage}
                  src={destinationScreen}
                  alt=""
                  draggable={false}
                />

                <span className={styles.searchText}>강남역 11번 출구</span>

                <div className={styles.bubbleLayer}>
                  {priceBubbles.map((bubble) => (
                    <span
                      key={bubble.id}
                      className={styles.bubbleLeave}
                      style={
                        {
                          left: `${bubble.x}%`,
                          top: `${bubble.y}%`,
                          '--push-x': `${bubble.pushX}px`,
                          '--push-y': `${bubble.pushY}px`,
                          animationDelay: `${bubble.leaveDelay}s`,
                        } as CSSProperties
                      }
                    >
                      <span
                        className={styles.bubble}
                        style={{ animationDelay: `${bubble.popDelay}s` }}
                      >
                        {bubble.price}
                      </span>
                    </span>
                  ))}
                </div>

                <span className={styles.radius} />

                {candidateDots.map((dot, index) => (
                  <img
                    key={`${dot.x}-${dot.y}`}
                    className={styles.candidateDot}
                    src={dotMarker}
                    alt=""
                    style={{
                      left: `${dot.x}%`,
                      top: `${dot.y}%`,
                      animationDelay: `${(index % 6) * 0.05}s`,
                    }}
                  />
                ))}

                {recommendations.map((pin, index) => (
                  <span
                    key={pin.rank}
                    className={styles.recommendPin}
                    style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  >
                    <span
                      className={cx(styles.bubble, styles.survivorPlain)}
                      style={{ animationDelay: `${0.5 + index * 0.4}s` }}
                    >
                      {pin.price}
                    </span>
                    <span
                      className={styles.landingRing}
                      style={{ animationDelay: `${index * 0.18}s` }}
                    />
                    <img
                      className={styles.survivorPicked}
                      src={parkingMarker}
                      alt=""
                      style={{ animationDelay: `${index * 0.18}s` }}
                    />
                  </span>
                ))}
              </div>

              <span className={styles.island} />
              <span className={styles.glare} />
            </div>
          </div>

          <div className={styles.lostCard}>
            <span className={styles.lostEmoji}>🤔</span>
            <p>
              주차장이 너무 많아요.
              <br />
              <strong>어디에 세우지?</strong>
            </p>
          </div>

          <div className={cx(styles.card, styles.walkCard)}>
            <img src={parkingMarker} alt="" className={styles.cardMarker} />
            <div>
              <p className={styles.cardEyebrow}>목적지에서 가장 가까워요</p>
              <p className={styles.cardTitle}>
                도보 <strong>4분</strong> · 210m
              </p>
            </div>
          </div>

          <div className={cx(styles.card, styles.feeCard)}>
            <p className={styles.cardEyebrow}>예상 요금</p>
            <p className={styles.feeValue}>7,500원</p>
            <p className={styles.cardCaption}>14:50 ~ 15:50 · 1시간 기준</p>
          </div>

          <div className={cx(styles.card, styles.appCard)}>
            <p className={styles.cardEyebrow}>길찾기는 쓰던 앱으로</p>
            <div className={styles.appRow}>
              {mapApps.map((app) => (
                <span
                  key={app.name}
                  className={styles.appChip}
                  style={
                    { '--app-bg': app.background, '--app-fg': app.foreground } as CSSProperties
                  }
                >
                  {app.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- 타임라인 ---------- */

const floating = keyframes`
  0%, 100% { transform: translateY(0) rotateX(6deg) rotateY(-18deg) rotateZ(1.5deg); }
  50% { transform: translateY(-10px) rotateX(4deg) rotateY(-12deg) rotateZ(1deg); }
`;

/** 가격 핀이 하나씩 톡톡 튀어나온다. 각자 animation-delay가 다르다. */
const bubblePop = keyframes`
  0% { opacity: 0; transform: scale(0); }
  ${at(0.22)} { opacity: 1; transform: scale(1.15); }
  ${at(0.36)} { opacity: 1; transform: scale(1); }
  ${at(8.4)} { opacity: 1; transform: scale(1); }
  ${at(8.5)}, 100% { opacity: 0; transform: scale(0); }
`;

/** 반경 원이 지나가면 바깥으로 밀려나며 사라진다. 원에서 먼 핀일수록 늦게 밀린다. */
const bubbleLeave = keyframes`
  0%, ${at(2.9)} { opacity: 1; transform: translate(0, 0) scale(1); }
  ${at(3.5)}, 100% { opacity: 0; transform: translate(var(--push-x), var(--push-y)) scale(0.4); }
`;

const lostCycle = keyframes`
  0%, ${at(1)} { opacity: 0; transform: translate3d(16px, 10px, 0) scale(0.9); }
  ${at(1.4)} { opacity: 1; transform: translate3d(0, 0, 60px) scale(1); }
  ${at(2.6)} { opacity: 1; transform: translate3d(0, 0, 60px) scale(1); }
  ${at(2.9)}, 100% { opacity: 0; transform: translate3d(0, -8px, 60px) scale(0.96); }
`;

/** 목적지에서 반경 원이 퍼진다. */
const radiusCycle = keyframes`
  0%, ${at(2.85)} { opacity: 0; transform: translate(-50%, -50%) scale(0.05); }
  ${at(2.95)} { opacity: 1; }
  ${at(3.7)}, ${at(9.9)} { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  ${at(10.4)}, 100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
`;

/** 추천으로 남는 핀. 다른 핀과 똑같이 튀어나왔다가, 원이 다 퍼지면 강조된 핀으로 바뀐다. */
const survivorPlain = keyframes`
  0% { opacity: 0; transform: scale(0); }
  ${at(0.22)} { opacity: 1; transform: scale(1.15); }
  ${at(0.36)}, ${at(3.3)} { opacity: 1; transform: scale(1); }
  ${at(3.45)}, 100% { opacity: 0; transform: scale(0.8); }
`;

/** 원 안 일반 주차장 점. 추천 마커와 함께 나타난다. */
const dotAppear = keyframes`
  0%, ${at(3.85)} { opacity: 0; transform: scale(0); }
  ${at(4.1)}, ${at(9.9)} { opacity: 1; transform: scale(1); }
  ${at(10.3)}, 100% { opacity: 0; transform: scale(1); }
`;

const survivorPicked = keyframes`
  0%, ${at(3.9)} { opacity: 0; transform: scale(0.5); }
  ${at(4.15)} { opacity: 1; transform: scale(1.18); }
  ${at(4.3)} { opacity: 1; transform: scale(0.96); }
  ${at(4.42)}, ${at(9.9)} { opacity: 1; transform: scale(1); }
  ${at(10.3)}, 100% { opacity: 0; transform: scale(0.9); }
`;

/** 추천 주차장 자리에서 퍼지는 물결. 순위마다 animation-delay를 둔다. */
const landingRing = keyframes`
  0%, ${at(3.95)} { opacity: 0; transform: translate(-50%, -50%) scale(0.2); }
  ${at(4.05)} { opacity: 0.7; }
  ${at(4.7)}, 100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
`;

/** 화면 밖으로 떠오르는 카드. 각자 animation-delay로 순서를 둔다. */
const cardCycle = keyframes`
  0%, ${at(5.1)} { opacity: 0; transform: translate3d(var(--from-x), 16px, 0) scale(0.9); }
  ${at(5.6)} { opacity: 1; transform: translate3d(0, 0, var(--lift)) scale(1); }
  ${at(9.6)} { opacity: 1; transform: translate3d(0, 0, var(--lift)) scale(1); }
  ${at(10.1)}, 100% { opacity: 0; transform: translate3d(0, 8px, var(--lift)) scale(0.96); }
`;

const glowBreath = keyframes`
  0%, 100% { opacity: 0.75; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.06); }
`;

const shadowBreath = keyframes`
  0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.5; }
  50% { transform: translateX(-50%) scale(0.92); opacity: 0.38; }
`;

const reduceMotion = '@media (prefers-reduced-motion: reduce)';

const styles = {
  /*
   * 폰 크기는 화면 너비와 높이 중 더 빠듯한 쪽에 맞춘다.
   * --height-scale은 useFitToViewportHeight가 화면 높이로 계산해 넣는다.
   */
  stage: css`
    --width-scale: 1;
    --height-scale: 1;
    --scene-scale: min(var(--width-scale), var(--height-scale));
    position: relative;
    height: calc(${STAGE_HEIGHT}px * var(--scene-scale));
    perspective: 1800px;
    perspective-origin: 50% 40%;
    @media (min-width: 1400px) {
      --width-scale: ${HEIGHT_SCALE.max};
    }
    ${TABLET} {
      --width-scale: 0.86;
    }
    ${MOBILE} {
      --width-scale: 0.7;
      height: 520px;
    }
  `,
  glow: css`
    position: absolute;
    top: 46%;
    left: 50%;
    width: 520px;
    height: 520px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgb(67 86 216 / 22%) 0%,
      rgb(67 86 216 / 8%) 45%,
      transparent 70%
    );
    transform: translate(-50%, -50%);
    animation: ${glowBreath} 6s ease-in-out infinite;
    ${MOBILE} {
      width: 380px;
      height: 380px;
    }
    ${reduceMotion} {
      animation: none;
    }
  `,
  floorShadow: css`
    position: absolute;
    bottom: calc(50% - 300px * var(--scene-scale));
    left: 50%;
    width: calc(260px * var(--scene-scale));
    height: 34px;
    border-radius: 50%;
    background: radial-gradient(ellipse, rgb(16 27 55 / 45%) 0%, transparent 70%);
    filter: blur(8px);
    animation: ${shadowBreath} 6s ease-in-out infinite;
    ${reduceMotion} {
      animation: none;
    }
  `,
  float: css`
    position: absolute;
    top: 50%;
    left: 50%;
    width: ${PHONE.width}px;
    height: ${PHONE.height}px;
    margin: ${-PHONE.height / 2}px 0 0 ${-PHONE.width / 2}px;
    transform: scale(var(--scene-scale));
    transform-style: preserve-3d;
  `,
  phone: css`
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    animation: ${floating} 6s ease-in-out infinite;
    ${reduceMotion} {
      animation: none;
      transform: rotateX(5deg) rotateY(-15deg) rotateZ(1deg);
    }
  `,
  bodyLayer: css`
    position: absolute;
    inset: 0;
    border-radius: ${PHONE.radius}px;
  `,
  sideButton: css`
    position: absolute;
    width: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, #4a5468, #a4adbf 50%, #4a5468);
    transform: translateZ(-6px);
  `,
  left: css`
    left: -3px;
  `,
  right: css`
    right: -3px;
  `,
  frame: css`
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    padding: ${BEZEL}px;
    border-radius: ${PHONE.radius}px;
    background: #0b0f1a;
    box-shadow:
      inset 0 0 0 1.5px #a7b0c2,
      inset 0 0 0 3px #1b2232,
      0 50px 90px -30px rgb(16 27 55 / 50%);
  `,
  screen: css`
    position: relative;
    width: ${SCREEN.width}px;
    height: ${SCREEN.height + STATUS_BAR}px;
    overflow: hidden;
    border-radius: ${PHONE.radius - BEZEL}px;
    background: ${palette.white};
  `,
  statusBar: css`
    display: flex;
    height: ${STATUS_BAR}px;
    align-items: center;
    justify-content: space-between;
    padding: 2px 24px 0 30px;
    font-size: 12px;
    font-weight: 700;
    color: ${color.text.primary};
  `,
  statusIcons: css`
    display: flex;
    align-items: center;
    gap: 5px;
    svg {
      width: 15px;
      height: 10px;
      fill: ${color.text.primary};
    }
  `,
  battery: css`
    position: relative;
    width: 20px;
    height: 10px;
    box-sizing: border-box;
    border: 1.5px solid ${color.text.primary};
    border-radius: 3px;
    &::after {
      content: '';
      position: absolute;
      inset: 1px 4px 1px 1px;
      border-radius: 1px;
      background: ${color.text.primary};
    }
  `,
  content: css`
    position: relative;
    height: ${SCREEN.height}px;
    overflow: hidden;
    background: ${palette.gray75};
    container-type: inline-size;
  `,
  screenImage: css`
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    user-select: none;
  `,
  /* 스크린샷 검색창의 "어디에 방문하세요?" 자리를 덮어 목적지를 보여준다. */
  searchText: css`
    position: absolute;
    top: 5.4%;
    left: 18.6%;
    width: 68%;
    height: 3.9%;
    display: flex;
    align-items: center;
    background: ${palette.white};
    font-size: 3.95cqw;
    font-weight: 600;
    color: ${color.text.primary};
    white-space: nowrap;
  `,
  bubbleLayer: css`
    position: absolute;
    inset: 0;
    ${reduceMotion} {
      display: none;
    }
  `,
  bubbleLeave: css`
    position: absolute;
    width: 0;
    height: 0;
    animation: ${bubbleLeave} ${CYCLE} cubic-bezier(0.5, 0, 0.75, 0) infinite both;
  `,
  /* 꼬리 끝이 좌표에 오도록 위로 띄운다. */
  bubble: css`
    position: absolute;
    bottom: 5px;
    left: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 3px 5px;
    border: 1px solid ${palette.gray800};
    border-radius: 3px;
    background: ${palette.white};
    box-shadow: 0 1px 3px rgb(16 27 55 / 25%);
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    color: ${color.text.primary};
    white-space: nowrap;
    translate: -50% 0;
    transform-origin: 50% 100%;
    animation: ${bubblePop} ${CYCLE} cubic-bezier(0.3, 1.4, 0.5, 1) infinite both;
    &::after {
      content: '';
      position: absolute;
      bottom: -4px;
      left: 50%;
      width: 6px;
      height: 6px;
      box-sizing: border-box;
      border-right: 1px solid ${palette.gray800};
      border-bottom: 1px solid ${palette.gray800};
      background: inherit;
      transform: translateX(-50%) rotate(45deg);
    }
  `,
  /* 물결의 중심을 스크린샷 P 마커에 맞춘다. */
  recommendPin: css`
    position: absolute;
    width: 0;
    height: 0;
  `,
  candidateDot: css`
    position: absolute;
    width: 7px;
    height: 7px;
    translate: -50% -50%;
    animation: ${dotAppear} ${CYCLE} ease-out infinite both;
    ${reduceMotion} {
      animation: none;
    }
  `,
  survivorPlain: css`
    animation-name: ${survivorPlain};
    ${reduceMotion} {
      display: none;
    }
  `,
  /* 마커 아래 끝이 좌표에 오도록 놓는다. 앱 지도와 같은 기준점이다. */
  survivorPicked: css`
    position: absolute;
    bottom: 0;
    left: -12px;
    width: 24px;
    height: 24px;
    filter: drop-shadow(0 4px 6px rgb(16 27 55 / 30%));
    transform-origin: 50% 100%;
    animation: ${survivorPicked} ${CYCLE} ease-out infinite both;
    z-index: 1;
    ${reduceMotion} {
      animation: none;
    }
  `,
  landingRing: css`
    position: absolute;
    width: 64px;
    height: 64px;
    border: 2px solid ${color.border.brand};
    border-radius: 50%;
    background: rgb(67 86 216 / 18%);
    animation: ${landingRing} ${CYCLE} ease-out infinite both;
    ${reduceMotion} {
      display: none;
    }
  `,
  radius: css`
    position: absolute;
    top: ${RADIUS_CENTER.y}%;
    left: ${RADIUS_CENTER.x}%;
    width: 70%;
    aspect-ratio: 1;
    box-sizing: border-box;
    border: 2px solid rgb(67 86 216 / 70%);
    border-radius: 50%;
    background: rgb(67 86 216 / 14%);
    opacity: 0;
    animation: ${radiusCycle} ${CYCLE} cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
    ${reduceMotion} {
      display: none;
    }
  `,
  island: css`
    position: absolute;
    top: 9px;
    left: 50%;
    width: 84px;
    height: 24px;
    border-radius: 12px;
    background: #05070c;
    transform: translateX(-50%);
  `,
  glare: css`
    position: absolute;
    inset: 0;
    background: linear-gradient(
      115deg,
      rgb(255 255 255 / 0%) 35%,
      rgb(255 255 255 / 16%) 46%,
      rgb(255 255 255 / 0%) 58%
    );
    pointer-events: none;
  `,

  /* ---------- 떠 있는 카드 ---------- */
  lostCard: css`
    position: absolute;
    top: 196px;
    left: -150px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 18px;
    background: ${palette.gray900};
    box-shadow: 0 24px 48px -16px rgb(16 27 55 / 45%);
    color: ${palette.white};
    opacity: 0;
    animation: ${lostCycle} ${CYCLE} cubic-bezier(0.2, 0.9, 0.25, 1.2) infinite;
    p {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.45;
      color: ${palette.gray200};
      white-space: nowrap;
    }
    strong {
      font-size: 15px;
      color: ${palette.white};
    }
    ${TABLET} {
      left: -60px;
    }
    ${MOBILE} {
      left: -96px;
    }
    ${reduceMotion} {
      display: none;
    }
  `,
  lostEmoji: css`
    font-size: 24px;
  `,
  card: css`
    --lift: 70px;
    --from-x: 0px;
    position: absolute;
    box-sizing: border-box;
    padding: 14px 16px;
    border: 1px solid rgb(255 255 255 / 70%);
    border-radius: 18px;
    background: rgb(255 255 255 / 94%);
    box-shadow:
      0 24px 48px -16px rgb(16 27 55 / 30%),
      0 4px 12px rgb(16 27 55 / 6%);
    color: ${color.text.primary};
    text-align: left;
    opacity: 0;
    animation: ${cardCycle} ${CYCLE} cubic-bezier(0.2, 0.9, 0.25, 1.2) infinite;
    p {
      margin: 0;
    }
    ${reduceMotion} {
      animation: none;
      opacity: 1;
      transform: translateZ(var(--lift));
    }
  `,
  walkCard: css`
    --from-x: 24px;
    top: 150px;
    left: -132px;
    ${MOBILE} {
      left: -84px;
    }
    display: flex;
    align-items: center;
    gap: 10px;
  `,
  feeCard: css`
    --lift: 90px;
    --from-x: -24px;
    top: 236px;
    right: -112px;
    ${MOBILE} {
      right: -78px;
    }
    animation-delay: 0.4s;
  `,
  appCard: css`
    --lift: 56px;
    --from-x: -24px;
    bottom: 22px;
    right: -84px;
    ${MOBILE} {
      right: -56px;
    }
    animation-delay: 0.8s;
  `,
  cardMarker: css`
    width: 30px;
    height: 30px;
    flex-shrink: 0;
  `,
  cardEyebrow: css`
    font-size: 12px;
    font-weight: 700;
    line-height: 1.4;
    color: ${color.text.brand};
    white-space: nowrap;
  `,
  cardTitle: css`
    margin-top: 2px !important;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.35;
    white-space: nowrap;
    strong {
      font-weight: 800;
    }
  `,
  feeValue: css`
    margin-top: 4px !important;
    font-size: 26px;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.5px;
  `,
  cardCaption: css`
    margin-top: 6px !important;
    font-size: 11.5px;
    color: ${color.text.secondary};
    white-space: nowrap;
  `,
  appRow: css`
    display: flex;
    gap: 6px;
    margin-top: 8px;
  `,
  appChip: css`
    padding: 7px 10px;
    border-radius: 10px;
    background: var(--app-bg);
    color: var(--app-fg);
    font-size: 12.5px;
    font-weight: 800;
    white-space: nowrap;
  `,
};
