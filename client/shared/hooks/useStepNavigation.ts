import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  MOVE_POLICY,
  type ActionByStep,
  type MovePolicy,
  type MoveRule,
  type Step,
} from '../policy/movePolicy';

/** 정책 상 화면 이름을 실제 라우팅 경로로 변환한다. */
const STEP_PATH = {
  home: '/',
  search: '/search',
  setup: '/parkingsetup',
  recommend: '/parkingRecommend',
  detail: '/parkingDetail',
} satisfies Record<Step, string>;

const policyByStep: MovePolicy = MOVE_POLICY;

/**
 * 현재 화면의 액션을 받아 React Router로 이동을 실행한다.
 * 이동 대상과 push·replace·뒤로가기 방식은 MOVE_POLICY에서 결정한다.
 * 같은 화면으로 이동할 때는 현재 URL의 쿼리와 해시를 보존한다.
 * state를 전달하면 이동할 히스토리 엔트리에 함께 저장한다.
 */
export const useStepNavigation = <From extends Step>(from: From) => {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();

  const move = useCallback(
    (action: ActionByStep[From], state?: unknown) => {
      const rule: MoveRule = policyByStep[from][action];

      // 뒤로 가기 처리
      if (rule.method === 'back') {
        navigate(-1);
        return;
      }

      // 현재 화면을 갱신하는 경우 쿼리와 해시를 보존한다.
      const target = rule.target === from ? { pathname, search, hash } : STEP_PATH[rule.target];

      void navigate(target, {
        state,
        replace: rule.method === 'replace', // 정책의 기록 방식을 라우터 옵션으로 변환한다.
      });
    },
    [from, navigate, pathname, search, hash],
  );

  return { move };
};
