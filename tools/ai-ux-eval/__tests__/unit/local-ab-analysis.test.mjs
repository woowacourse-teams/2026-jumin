import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAbRun, analyzeAbPairs } from '../../local-ab-analysis.mjs';

// 환경 실패와 모델 미달, 기능 미지원, 검증 불가는 서로 다른 결과다.
test('실행 종료와 독립 검증을 각 범주로 보존한다', () => {
  const run = (termination, verification) => ({ result: { termination, verification } });
  assert.equal(classifyAbRun(run('feature_unavailable', 'unavailable')), 'feature_unavailable');
  assert.equal(classifyAbRun(run('policy_violation', 'not_met')), 'environment_error');
  assert.equal(classifyAbRun(run('model_output_limit', 'not_met')), 'model_error');
  // 전체 제한 초과만으로 서버나 모델 중 어느 쪽이 원인인지 단정하지 않는다.
  assert.equal(classifyAbRun(run('timeout', 'unavailable')), 'execution_error');
  assert.equal(classifyAbRun(run('interrupted', 'unavailable')), 'execution_error');
  assert.equal(classifyAbRun(run('action_limit', 'not_met')), 'task_not_met');
  assert.equal(classifyAbRun(run('model_finished', 'unavailable')), 'verification_unavailable');
  assert.equal(classifyAbRun(run('action_limit', 'passed')), 'task_completed');
  assert.equal(classifyAbRun(null), 'not_run');
  const absent = analyzeAbPairs([], {}, 'dev');
  assert.equal(absent[0].behaviorComparison, 'unavailable');
  assert.equal(absent[0].coreParkingComparison, 'unavailable');
});
