/**
 * [임시 계측] iOS 전환 지연 원인 분석용. 원인 확정 후 이 파일과 모든 [PERF] 호출부를 제거한다.
 * 되돌리기: git checkout -- client/src client/App.tsx && rm client/src/perf.ts
 */

const counters = new Map<string, number>();

interface Rollup {
  count: number;
  total: number;
  max: number;
  start: number;
  timer: number | null;
}

const rollups = new Map<string, Rollup>();

const format = (extra?: Record<string, unknown>) =>
  extra
    ? ' ' +
      Object.entries(extra)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' ')
    : '';

/** 단발 로그. ms를 주면 소요시간을 함께 찍는다. */
export const perfLog = (label: string, ms?: number, extra?: Record<string, unknown>) => {
  console.log(`[PERF] ${label}${ms === undefined ? '' : ` ${ms.toFixed(1)}ms`}${format(extra)}`);
};

/** 호출 횟수 누적 후 현재 회차를 반환한다. */
export const perfCount = (name: string) => {
  const next = (counters.get(name) ?? 0) + 1;
  counters.set(name, next);
  return next;
};

/**
 * 고빈도 이벤트용. 매번 찍지 않고 500ms 창으로 묶어서 횟수/누적시간/최대시간을 보고한다.
 * 로그 자체가 측정을 왜곡하는 것을 막는다.
 */
export const perfRollup = (name: string, ms = 0) => {
  let rollup = rollups.get(name);
  if (!rollup) {
    rollup = { count: 0, total: 0, max: 0, start: performance.now(), timer: null };
    rollups.set(name, rollup);
  }
  const current = rollup;
  current.count += 1;
  current.total += ms;
  current.max = Math.max(current.max, ms);
  if (current.timer === null) {
    current.timer = window.setTimeout(() => {
      perfLog(`rollup:${name}`, performance.now() - current.start, {
        calls: current.count,
        total: `${current.total.toFixed(1)}ms`,
        max: `${current.max.toFixed(1)}ms`,
      });
      rollups.delete(name);
    }, 500);
  }
};

/** 지금부터 다음 페인트가 끝날 때까지의 시간. 화면 전환 체감 지연 측정용. */
export const perfPaint = (label: string) => {
  const start = performance.now();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      perfLog(label, performance.now() - start);
    });
  });
};
