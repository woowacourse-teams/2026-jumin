import assert from 'node:assert/strict';
import test from 'node:test';
import { createTriadReport, markdownTriadReport } from '../../local-triad-report.mjs';

// 세 조건을 각각 독립 결과로 유지하고 보고서에는 안전한 범주만 들어간다.
test('세 조건 보고서는 자기 보고와 독립 판정을 분리하며 원문을 배제한다', () => {
  const raw = (persona) => ({
    mode: 'local',
    source: 'local_run',
    scenario: 'local-one-hour-parking',
    persona,
    model: 'qwen3.5:9b',
    modelClaim: true,
    verification: 'unavailable',
    verificationReason: 'not_verified',
    goal: '서울특별시 용산구 한강대로 405에 있는 서울역을 검색하고, 현재 기본 주차 조건에서 주차장 하나를 선택하여 길찾기 앱 선택 화면을 여세요.',
    actions: [
      { tool: 'browser_click', target: 'other_button', outcome: 'success', text: 'PRIVATE' },
    ],
    snapshot: 'PRIVATE',
    modelOptions: { num_predict: 512 },
  });
  const result = createTriadReport([raw('walking'), raw('baseline'), raw('price')]);
  assert.deepEqual(
    result.runs.map((x) => x.persona),
    ['baseline', 'price', 'walking'],
  );
  assert.equal(result.runs[0].modelClaim, true);
  assert.equal(result.runs[0].verification, 'unavailable');
  assert.doesNotMatch(JSON.stringify(result) + markdownTriadReport(result), /PRIVATE/);
  assert.throws(() => createTriadReport([raw('baseline'), raw('baseline'), raw('walking')]));
});
