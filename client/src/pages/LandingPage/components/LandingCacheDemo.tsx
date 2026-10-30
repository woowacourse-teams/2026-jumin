import { css } from '@emotion/css';
import { useState } from 'react';

import parkingMarker from '../../../../assets/icons/markers/homeParkingMarker.svg';
import { Button } from '../../../../shared/components/ui/Button';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';
import {
  GRID,
  GRID_CELLS,
  INITIAL_OFFSET,
  PARKING_PINS,
  countVisiblePins,
  moveGridViewport,
  queryGridCache,
  type Direction,
} from '../utils/gridCacheSimulation';

const directions: Array<{ direction: Direction; symbol: string; label: string }> = [
  { direction: 'left', symbol: '←', label: '왼쪽' },
  { direction: 'up', symbol: '↑', label: '위쪽' },
  { direction: 'down', symbol: '↓', label: '아래쪽' },
  { direction: 'right', symbol: '→', label: '오른쪽' },
];

export const LandingCacheDemo = () => {
  const [state, setState] = useState(() => ({
    offset: INITIAL_OFFSET,
    ...queryGridCache(INITIAL_OFFSET, new Set<string>()),
    cleared: false,
  }));
  const { offset, cache, hits, misses, cleared } = state;
  const visiblePinCount = countVisiblePins(offset);

  const move = (direction: Direction) => {
    setState((previous) => {
      const offset = moveGridViewport(previous.offset, direction);
      return { offset, ...queryGridCache(offset, previous.cache), cleared: false };
    });
  };

  const resetPosition = () => {
    setState((previous) => ({
      offset: INITIAL_OFFSET,
      ...queryGridCache(INITIAL_OFFSET, previous.cache),
      cleared: false,
    }));
  };

  const clearCache = () => {
    setState((previous) => ({
      offset: previous.offset,
      ...queryGridCache(previous.offset, new Set<string>()),
      cleared: true,
    }));
  };

  let explanation: string;
  if (cleared) {
    explanation = `캐시가 비었어요. 현재 화면의 ${misses.size}칸 모두 DB에서 다시 가져와 캐시에 저장했어요.`;
  } else if (misses.size === 0) {
    explanation = `${hits.size}칸 모두 캐시 적중. 저장해 둔 주차장 데이터를 그대로 재사용했어요.`;
  } else if (hits.size === 0) {
    explanation = `캐시에 없는 지역이라 ${misses.size}칸 모두 DB에서 가져와 캐시에 저장했어요.`;
  } else {
    explanation = `${hits.size}칸은 캐시에서 바로 꺼내고, 캐시에 없던 ${misses.size}칸만 DB에서 가져왔어요.`;
  }

  return (
    <section className={styles.demo} aria-label="격자 캐시 시뮬레이션">
      <div className={styles.phone}>
        <div className={styles.search}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
            <path d="m16 16 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>주차장 검색</span>
        </div>
        <div className={styles.viewport} aria-hidden="true">
          <div
            className={styles.map}
            style={{ transform: `translate(${-offset.ox}px, ${-offset.oy}px)` }}
          >
            {GRID_CELLS.map((cell) => (
              <div
                key={cell.key}
                className={styles.cell}
                data-cache-state={
                  hits.has(cell.key) ? 'hit' : misses.has(cell.key) ? 'miss' : undefined
                }
                style={{ left: cell.column * GRID.cellSize, top: cell.row * GRID.cellSize }}
              >
                <span>{cell.label}</span>
              </div>
            ))}
            {PARKING_PINS.map((pin, index) => (
              <img
                key={index}
                className={styles.pin}
                src={parkingMarker}
                alt=""
                width={18}
                height={18}
                style={{ left: pin.x, top: pin.y }}
              />
            ))}
          </div>
        </div>
        <div className={styles.sheet}>
          <span className={styles.handle} aria-hidden="true" />
          <p>
            이 지역 주차장 <strong>{visiblePinCount}</strong>곳
          </p>
          <span className={styles.filters}>무료, 공영, 기계식 제외 필터</span>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.directions} role="group" aria-label="지도 이동">
          {directions.map(({ direction, symbol, label }) => {
            const next = moveGridViewport(offset, direction);
            return (
              <Button
                key={direction}
                variant="outline"
                className={styles.directionButton}
                aria-label={`지도를 ${label}으로 이동`}
                disabled={next.ox === offset.ox && next.oy === offset.oy}
                onClick={() => move(direction)}
              >
                <span aria-hidden="true">{symbol}</span>
              </Button>
            );
          })}
        </div>
        <div className={styles.actions}>
          <Button variant="outline" className={styles.actionButton} onClick={resetPosition}>
            처음 위치로
          </Button>
          <Button variant="outline" className={styles.actionButton} onClick={clearCache}>
            캐시 비우기
          </Button>
        </div>
      </div>

      <div className={styles.legend} aria-label="지도 색상 범례">
        <span>
          <i className={styles.hitSwatch} aria-hidden="true" />
          캐시 적중
        </span>
        <span>
          <i className={styles.missSwatch} aria-hidden="true" />
          DB 조회
        </span>
      </div>

      <dl className={styles.metrics} aria-label="이번 조회 지표">
        <div>
          <dt>화면에 걸친 칸</dt>
          <dd>
            {hits.size + misses.size}
            <span>칸</span>
          </dd>
        </div>
        <div>
          <dt>캐시에 저장된 칸</dt>
          <dd>
            {cache.size}
            <span>칸</span>
          </dd>
        </div>
        <div>
          <dt>캐시 적중</dt>
          <dd className={styles.hitNumber}>
            {hits.size}
            <span>칸</span>
          </dd>
        </div>
        <div>
          <dt>DB 조회</dt>
          <dd className={styles.missNumber}>
            {misses.size}
            <span>칸</span>
          </dd>
        </div>
      </dl>
      <p className={styles.explanation} role="status" aria-live="polite" aria-atomic="true">
        {explanation}
      </p>
      <p className={styles.note}>색상과 적중·조회 지표는 이번 조회의 결과예요.</p>
    </section>
  );
};

const styles = {
  demo: css`
    min-width: 0;
    padding: 28px 20px 24px;
    border: 1px solid rgb(255 255 255 / 12%);
    border-radius: 16px;
    background: rgb(255 255 255 / 3%);

    @media (max-width: 400px) {
      margin: 0 -16px;
      padding: 24px 0;
      border: 0;
      background: none;
    }
  `,
  phone: css`
    width: 284px;
    margin: 0 auto;
    padding: 7px;
    overflow: hidden;
    border: 1px solid ${color.border.default};
    border-radius: 24px;
    background: ${color.background.default};
    color: ${color.text.primary};
    box-shadow: 0 18px 48px rgb(0 0 0 / 18%);
  `,
  search: css`
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    margin: 6px 6px 12px;
    padding: 0 12px;
    border: 1px solid ${color.border.brandSubtle};
    border-radius: 10px;
    color: ${color.text.brand};
    ${typography.bodySmall};
    span {
      color: ${color.text.secondary};
    }
  `,
  viewport: css`
    position: relative;
    width: ${GRID.viewportWidth}px;
    height: ${GRID.viewportHeight}px;
    overflow: hidden;
    background: ${color.background.subtle};
  `,
  map: css`
    position: absolute;
    width: ${GRID.width}px;
    height: ${GRID.height}px;
    transition: transform 0.3s ease;
    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `,
  cell: css`
    position: absolute;
    width: ${GRID.cellSize}px;
    height: ${GRID.cellSize}px;
    border: 1px dashed #8996a9;
    background: ${color.background.subtle};
    &[data-cache-state='hit'] {
      background: #d9f2e5;
    }
    &[data-cache-state='miss'] {
      background: #ffe9cc;
    }
    span {
      position: absolute;
      top: 3px;
      left: 4px;
      color: ${color.text.secondary};
      font-size: 10px;
      font-weight: 700;
    }
  `,
  pin: css`
    position: absolute;
    transform: translate(-50%, -50%);
  `,
  sheet: css`
    padding: 10px 8px 14px;
    p {
      margin: 12px 0 6px;
      ${typography.bodySmallStrong};
    }
  `,
  handle: css`
    display: block;
    width: 30px;
    height: 4px;
    margin: 0 auto;
    border-radius: 4px;
    background: ${color.background.muted};
  `,
  filters: css`
    display: block;
    color: ${color.text.secondary};
    font-size: 11px;
    line-height: 1.6;
  `,
  controls: css`
    width: 284px;
    margin: 22px auto;
  `,
  directions: css`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  `,
  directionButton: css`
    min-height: 44px;
    padding: 0;
    border-radius: 9px;
    font-size: 23px;
    &:disabled {
      opacity: 0.4;
    }
  `,
  actions: css`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 10px;
  `,
  actionButton: css`
    min-height: 42px;
    padding: 0 8px;
    border-radius: 9px;
    font-size: 12px;
  `,
  legend: css`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px 24px;
    margin-bottom: 18px;
    ${typography.caption};
    color: ${color.text.inverseSecondary};
    span {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }
    i {
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }
  `,
  hitSwatch: css`
    background: #7bddad;
  `,
  missSwatch: css`
    background: #ffc47e;
  `,
  metrics: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    max-width: 360px;
    margin: 0 auto;
    div {
      padding: 16px;
      border: 1px solid rgb(255 255 255 / 12%);
      border-radius: 10px;
      background: rgb(255 255 255 / 3%);
    }
    dt {
      ${typography.caption};
      color: ${color.text.inverseSecondary};
    }
    dd {
      margin: 8px 0 0;
      color: ${color.text.inverse};
      font-size: 26px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      line-height: 1.2;
      span {
        margin-left: 5px;
        font-size: 12px;
        font-weight: 400;
      }
    }
  `,
  hitNumber: css`
    && {
      color: #7bddad;
    }
  `,
  missNumber: css`
    && {
      color: #ff9797;
    }
  `,
  explanation: css`
    max-width: 360px;
    margin: 20px auto 0 !important;
    ${typography.bodySmall};
    color: ${color.text.inverse};
    line-height: 1.8;
    overflow-wrap: anywhere;
  `,
  note: css`
    max-width: 360px;
    margin: 10px auto 0 !important;
    ${typography.caption};
    color: ${color.text.inverseSecondary};
    line-height: 1.7;
  `,
};
