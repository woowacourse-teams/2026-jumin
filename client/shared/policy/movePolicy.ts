/** 화면 이동의 단계 */
export type Step = 'home' | 'search' | 'setup' | 'recommend' | 'detail';

/** 각 화면에서 사용자가 할 수 있는 행동 */
export type ActionByStep = {
  home: 'OPEN_SEARCH' | 'OPEN_DETAIL';
  search: 'BACK' | 'SELECT_DESTINATION';
  setup: 'BACK' | 'OPEN_SEARCH' | 'CONFIRM_DESTINATION' | 'CHANGE_DESTINATION';
  recommend: 'BACK' | 'OPEN_DETAIL' | 'SAVE_VIEW';
  detail: 'BACK';
};

/** 다음 화면으로 넘어가는 경우에만 목적지(Step)가 필요하며, 뒤로 가기는 필요하지 않다. */
export type MoveRule = { target: Step; method: 'push' | 'replace' } | { method: 'back' };

export type MovePolicy = {
  [From in Step]: Record<ActionByStep[From], MoveRule>;
};

/** 주차장 탐색 흐름에 맞는 단계별 전이, 히스토리 제어, 상태 복원 전용으로만 정책을 정의 */
export const MOVE_POLICY = {
  home: {
    OPEN_SEARCH: { target: 'search', method: 'push' },
    OPEN_DETAIL: { target: 'detail', method: 'push' },
  },
  search: {
    BACK: { method: 'back' },
    SELECT_DESTINATION: { target: 'setup', method: 'push' },
  },
  setup: {
    BACK: { method: 'back' },
    OPEN_SEARCH: { target: 'search', method: 'push' },
    CONFIRM_DESTINATION: { target: 'recommend', method: 'push' },
    CHANGE_DESTINATION: { target: 'setup', method: 'replace' },
  },
  recommend: {
    BACK: { method: 'back' },
    OPEN_DETAIL: { target: 'detail', method: 'push' },
    SAVE_VIEW: { target: 'recommend', method: 'replace' },
  },
  detail: {
    BACK: { method: 'back' },
  },
} satisfies MovePolicy;
