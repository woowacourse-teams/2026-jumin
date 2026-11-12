import { css, cx } from '@emotion/css';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

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
import { EASE_OUT, landing, MOBILE, TABLET } from '../landingStyles';

interface ParkingLot {
  id: string;
  name: string;
  /** 목적지까지 도보 거리(m)와 시간(분). */
  distance: number;
  walkMinutes: number;
  freeMinutes: number;
  base: { minutes: number; fee: number };
  extra: { minutes: number; fee: number };
  dailyMax: number;
}

/** 체험용 예시 주차장. 요금 체계와 거리가 서로 달라 정렬 기준에 따라 순위가 뒤바뀐다. */
const parkingLots: ParkingLot[] = [
  {
    id: 'building',
    name: '역 앞 빌딩 주차장',
    distance: 42,
    walkMinutes: 1,
    freeMinutes: 0,
    base: { minutes: 30, fee: 2000 },
    extra: { minutes: 10, fee: 1000 },
    dailyMax: 40000,
  },
  {
    id: 'private',
    name: '골목 안 민영 주차장',
    distance: 190,
    walkMinutes: 3,
    freeMinutes: 0,
    base: { minutes: 30, fee: 1500 },
    extra: { minutes: 30, fee: 1500 },
    dailyMax: 24000,
  },
  {
    id: 'mall',
    name: '쇼핑몰 주차장',
    distance: 260,
    walkMinutes: 4,
    freeMinutes: 30,
    base: { minutes: 10, fee: 800 },
    extra: { minutes: 10, fee: 800 },
    dailyMax: 30000,
  },
  {
    id: 'public',
    name: '구청 공영 주차장',
    distance: 330,
    walkMinutes: 5,
    freeMinutes: 0,
    base: { minutes: 5, fee: 250 },
    extra: { minutes: 5, fee: 250 },
    dailyMax: 13000,
  },
];

const sortOptions = [
  { value: 'recommend', label: '추천순', reason: '거리와 가격의 균형 1위예요' },
  { value: 'distance', label: '거리순', reason: '목적지에서 가장 가까워요' },
  { value: 'price', label: '가격순', reason: '설정한 조건에서 제일 저렴해요' },
] as const;
type SortValue = (typeof sortOptions)[number]['value'];

/** 앱과 같이 1시간 주차를 기준으로 예상 요금을 계산한다. */
const PARKING_MINUTES = 60;
const ROW_HEIGHT = 92;
const ROW_GAP = 12;

/** 무료시간을 뺀 이용시간에 기본요금과 추가요금 단위를 적용하고, 일 최대요금으로 상한을 둔다. */
const estimateFee = (lot: ParkingLot, minutes: number) => {
  const billable = minutes - lot.freeMinutes;
  if (billable <= 0) return 0;
  const extraUnits = Math.ceil(Math.max(0, billable - lot.base.minutes) / lot.extra.minutes);
  return Math.min(lot.base.fee + extraUnits * lot.extra.fee, lot.dailyMax);
};

const normalize = (value: number, values: number[]) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max === min ? 0 : (value - min) / (max - min);
};

const rankLots = (minutes: number, sort: SortValue) => {
  const entries = parkingLots.map((lot) => ({ lot, fee: estimateFee(lot, minutes) }));
  const fees = entries.map((entry) => entry.fee);
  const distances = entries.map((entry) => entry.lot.distance);
  const score = (entry: (typeof entries)[number]) => {
    if (sort === 'distance') return entry.lot.distance;
    if (sort === 'price') return entry.fee;
    return normalize(entry.fee, fees) + normalize(entry.lot.distance, distances);
  };
  return [...entries].sort((a, b) => score(a) - score(b) || a.lot.distance - b.lot.distance);
};

const formatFee = (fee: number) => (fee === 0 ? '무료' : `${fee.toLocaleString('ko-KR')}원`);

/** 값이 바뀌면 이전 값에서 새 값까지 숫자가 굴러가듯 이어지게 한다. */
const useAnimatedNumber = (target: number) => {
  const [value, setValue] = useState(target);
  const currentRef = useRef(target);

  useEffect(() => {
    const from = currentRef.current;
    if (from === target) return undefined;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduceMotion ? 0 : 420;
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick(now: number) {
      const progress = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round((from + (target - from) * eased) / 10) * 10;
      currentRef.current = progress === 1 ? target : next;
      setValue(currentRef.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
};

const AnimatedFee = ({ fee }: { fee: number }) => <>{formatFee(useAnimatedNumber(fee))}</>;

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

export const CompareSection = () => {
  const [sort, setSort] = useState<SortValue>('recommend');
  const sortName = useId();

  const ranked = rankLots(PARKING_MINUTES, sort);
  const top = ranked[0]!;
  const { reason, label: sortLabel } = sortOptions.find((option) => option.value === sort)!;

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
            <br />
            정렬 기준을 바꿔 순위가 어떻게 달라지는지 직접 확인해 보세요.
          </p>
        </header>

        <div className={styles.simulator} data-reveal>
          <div className={styles.controls}>
            <p className={styles.badge}>직접 해보기</p>
            <div className={styles.durationHeader}>
              <span>예상 요금 기준</span>
              <strong className={styles.durationValue}>1시간 주차</strong>
            </div>

            <fieldset className={styles.sortGroup}>
              <legend>정렬 기준</legend>
              <div className={styles.sortOptions}>
                {sortOptions.map((option) => (
                  <label key={option.value} className={styles.sortOption}>
                    <input
                      type="radio"
                      name={sortName}
                      value={option.value}
                      checked={sort === option.value}
                      onChange={() => setSort(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <p className={styles.summary} role="status" aria-live="polite">
              {sortLabel}으로 보면 <strong>{top.lot.name}</strong>이 1위예요.
            </p>
          </div>

          <div className={styles.listPanel}>
            <ol
              className={styles.list}
              style={{ height: parkingLots.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP }}
              aria-label="예시 주차장 순위"
            >
              {parkingLots.map((lot) => {
                const rank = ranked.findIndex((entry) => entry.lot.id === lot.id);
                const fee = ranked[rank]!.fee;
                const isTop = rank === 0;
                return (
                  <li
                    key={lot.id}
                    className={cx(styles.row, isTop && styles.topRow)}
                    style={{ transform: `translateY(${rank * (ROW_HEIGHT + ROW_GAP)}px)` }}
                    aria-label={`${rank + 1}위 ${lot.name}, 예상 요금 ${formatFee(fee)}, 도보 ${lot.walkMinutes}분`}
                  >
                    <span className={styles.rank} aria-hidden="true">
                      {rank + 1}
                    </span>
                    <div className={styles.rowBody} aria-hidden="true">
                      <p className={styles.rowName}>{lot.name}</p>
                      <p className={styles.rowMeta}>
                        {isTop ? (
                          <span className={styles.rowReason}>{reason}</span>
                        ) : (
                          `${lot.distance}m(${lot.walkMinutes}분)`
                        )}
                      </p>
                    </div>
                    <div className={styles.rowFee} aria-hidden="true">
                      <strong>
                        <AnimatedFee fee={fee} />
                      </strong>
                      {isTop && (
                        <span>
                          {lot.distance}m({lot.walkMinutes}분)
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className={styles.disclaimer}>이해를 돕기 위한 예시 주차장과 요금이에요.</p>
          </div>
        </div>

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
  simulator: css`
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: 24px;
    margin-top: 72px;
    padding: 24px;
    border-radius: 40px;
    background: ${color.background.default};
    box-shadow:
      0 40px 80px -48px rgb(16 27 55 / 28%),
      0 2px 6px rgb(16 27 55 / 4%);
    ${TABLET} {
      grid-template-columns: minmax(0, 1fr);
    }
    ${MOBILE} {
      margin-top: 48px;
      padding: 12px;
      border-radius: 28px;
    }
  `,
  controls: css`
    display: flex;
    flex-direction: column;
    padding: 28px 24px 24px;
    ${MOBILE} {
      padding: 20px 12px 8px;
    }
  `,
  badge: css`
    align-self: flex-start;
    padding: 6px 12px;
    border-radius: 999px;
    background: ${color.background.brandSubtle};
    ${typography.caption};
    font-weight: 800;
    color: ${color.text.brand};
  `,
  durationHeader: css`
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-top: 28px;
    span {
      ${typography.label};
      font-size: 1rem;
      color: ${color.text.secondary};
    }
  `,
  durationValue: css`
    font-size: clamp(2rem, 4vw, 2.75rem);
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  `,
  sortGroup: css`
    min-width: 0;
    margin: 32px 0 0;
    padding: 0;
    border: 0;
    legend {
      padding: 0;
      ${typography.label};
      font-size: 1rem;
      color: ${color.text.secondary};
    }
  `,
  sortOptions: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-top: 12px;
  `,
  sortOption: css`
    position: relative;
    cursor: pointer;
    input {
      position: absolute;
      inset: 0;
      margin: 0;
      opacity: 0;
      cursor: pointer;
    }
    span {
      display: flex;
      min-height: 48px;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      background: ${color.background.brandSubtle};
      ${typography.label};
      font-size: 0.9375rem;
      color: ${color.text.brand};
      transition:
        background 200ms ease,
        color 200ms ease,
        transform 300ms ${EASE_OUT};
    }
    &:hover span {
      background: ${color.background.brandSubtleHovered};
    }
    input:checked + span {
      background: ${color.background.brand};
      color: ${color.text.inverse};
    }
    input:active + span {
      transform: scale(0.96);
    }
    input:focus-visible + span {
      outline: 2px solid ${color.focus.ring};
      outline-offset: 2px;
    }
  `,
  summary: css`
    margin-top: auto !important;
    padding-top: 32px;
    ${typography.body};
    line-height: 1.6;
    color: ${color.text.secondary};
    strong {
      color: ${color.text.primary};
    }
    ${TABLET} {
      padding-top: 24px;
    }
  `,
  listPanel: css`
    padding: 24px;
    border-radius: 28px;
    background: ${color.background.brandSubtle};
    ${MOBILE} {
      padding: 12px;
      border-radius: 20px;
    }
  `,
  list: css`
    position: relative;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  row: css`
    position: absolute;
    inset: 0 0 auto;
    display: flex;
    height: ${ROW_HEIGHT}px;
    box-sizing: border-box;
    align-items: center;
    gap: 16px;
    padding: 0 20px;
    border: 2px solid transparent;
    border-radius: 22px;
    background: ${color.background.default};
    transition:
      transform 600ms ${EASE_OUT},
      border-color 300ms ease,
      box-shadow 300ms ease;
    ${MOBILE} {
      gap: 12px;
      padding: 0 14px;
    }
  `,
  topRow: css`
    z-index: 1;
    border-color: ${color.border.brand};
    box-shadow: 0 16px 32px -20px rgb(67 86 216 / 60%);
    > span:first-child {
      background: ${color.background.brand};
      color: ${color.text.inverse};
    }
  `,
  rank: css`
    display: grid;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    place-items: center;
    border-radius: 10px;
    background: ${color.background.subtle};
    ${typography.label};
    color: ${color.text.secondary};
    font-variant-numeric: tabular-nums;
    transition:
      background 300ms ease,
      color 300ms ease;
  `,
  rowBody: css`
    min-width: 0;
    flex: 1;
  `,
  rowName: css`
    overflow: hidden;
    ${typography.titleCard};
    font-size: 1.0625rem;
    text-overflow: ellipsis;
    white-space: nowrap;
    ${MOBILE} {
      font-size: 0.9375rem;
    }
  `,
  rowMeta: css`
    margin-top: 2px !important;
    ${typography.bodySmall};
    color: ${color.text.secondary};
    ${MOBILE} {
      font-size: 0.8125rem;
    }
  `,
  rowReason: css`
    font-weight: 700;
    color: ${color.text.brand};
  `,
  rowFee: css`
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    align-items: flex-end;
    strong {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    span {
      ${typography.caption};
      color: ${color.text.secondary};
    }
    ${MOBILE} {
      strong {
        font-size: 1.0625rem;
      }
    }
  `,
  disclaimer: css`
    margin-top: 16px !important;
    ${typography.caption};
    color: ${color.text.secondary};
    text-align: center;
  `,
  features: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
    margin-top: 24px;
    ${TABLET} {
      grid-template-columns: minmax(0, 1fr);
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
