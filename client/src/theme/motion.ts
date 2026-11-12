/**
 * 전환 시간(ms).
 *
 * - fast: 누름·색 변화처럼 손가락에 바로 답하는 전환
 * - base: 선택·표시선 이동·모달 등장
 * - slow: 시트 높이·목록 자리 이동처럼 큰 면의 전환
 */
export const durationMs = {
  fast: 160,
  base: 300,
  slow: 440,
} as const;

export const duration = {
  fast: `${durationMs.fast}ms`,
  base: `${durationMs.base}ms`,
  slow: `${durationMs.slow}ms`,
} as const;

/**
 * 가감속 곡선.
 *
 * - out: 빠르게 출발해 부드럽게 멈춘다. 등장과 누름 복귀에 사용한다.
 * - inOut: 천천히 출발해 천천히 멈춘다. 화면 안에서 자리를 옮길 때 사용한다.
 * - sheet: 바텀시트처럼 손을 따라 움직이던 면이 제자리를 찾을 때 사용한다.
 */
export const easing = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  sheet: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const;

/** 누르는 동안 컨트롤을 살짝 줄인다. */
export const pressScale = 0.97;
