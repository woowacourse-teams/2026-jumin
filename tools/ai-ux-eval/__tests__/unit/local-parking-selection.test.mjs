import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyParkingEvidence } from '../../local-parking-logic.mjs';
import { classifyLocalRequest } from '../../local-safety.mjs';
import { parseOptions } from '../../options.mjs';
import { createLocalReport } from '../../local-report.mjs';
import { runLocalSmoke } from '../../local-smoke.mjs';

const origins = {
  appOrigin: 'http://localhost:3000',
  wrapperOrigin: 'http://127.0.0.1:1111',
  scenario: 'local-select-parking',
};
const req = (path, method = 'GET', navigation = false) => ({
  url: `http://localhost:3000${path}`,
  method,
  navigation,
  topLevel: false,
  resourceType: 'fetch',
});

test('동일한 실제 주차 과제의 기준·요금·도보 관점과 준비 전 차단', async () => {
  const scenarios = ['baseline', 'price', 'walking'].map((persona) =>
    parseOptions(
      [
        '--mode',
        'local',
        '--local-url',
        'http://localhost:3000',
        '--scenario',
        'local-select-parking',
        '--persona',
        persona,
        '--model',
        'qwen3.5:9b',
      ],
      {},
    ),
  );
  assert.equal(new Set(scenarios.map((x) => x.scenario.goal)).size, 1);
  assert.equal(scenarios[0].persona.description, null);
  assert.throws(() =>
    parseOptions(
      [
        '--mode',
        'local',
        '--local-url',
        'http://localhost:3000',
        '--scenario',
        'local-select-parking',
        '--persona',
        'first-time',
        '--model',
        'qwen3.5:9b',
      ],
      {},
    ),
  );
  let launched = false;
  const result = await runLocalSmoke(scenarios[1], {
    env: {},
    frontendLauncher: () => {
      launched = true;
    },
  });
  assert.equal(result.termination, 'feature_unavailable');
  assert.equal(result.modelRequests, 0);
  assert.equal(launched, false);
});

test('조회만 제한적으로 허용하고 쓰기·리디렉션 우회용 인자는 거부한다', () => {
  const valid = [
    '/api/destinations/search?query=test&latitude=37&longitude=127',
    '/api/destinations/reverse-geocode?latitude=37&longitude=127',
    '/api/parking/search?destinationLatitude=37&destinationLongitude=127&entryAt=2026-11-11T09%3A00%3A00%2B09%3A00&exitAt=2026-11-11T11%3A00%3A00%2B09%3A00',
    '/api/parking/12?destinationLatitude=37&destinationLongitude=127&entryAt=2026-11-11T09%3A00%3A00%2B09%3A00&exitAt=2026-11-11T11%3A00%3A00%2B09%3A00',
    '/api/parking/viewport/12',
  ];
  for (const path of valid)
    assert.equal(classifyLocalRequest(req(path), origins).allow, true, path);
  for (const path of [
    '/api/parking/12/like',
    '/api/parking/review',
    '/api/destinations/search?query=test&latitude=37&longitude=127&redirect=1',
    '/api/parking/viewport/12?x=1',
    '/api/parking/search?destinationLatitude=37&destinationLatitude=38&destinationLongitude=127&entryAt=x&exitAt=x',
  ])
    assert.equal(classifyLocalRequest(req(path), origins).allow, false, path);
  assert.equal(classifyLocalRequest(req('/api/parking/review', 'POST'), origins).allow, false);
  assert.equal(classifyLocalRequest(req('/api/parking/12/like', 'PUT'), origins).allow, false);
  assert.equal(
    classifyLocalRequest(req('/api/destinations/search?query=test&latitude=37&longitude=127'), {
      ...origins,
      scenario: 'local-open-search',
    }).allow,
    false,
  );
  assert.equal(
    classifyLocalRequest(req('/parkingsetup?lat=37&lng=127&name=test', 'GET', true), origins).allow,
    true,
  );
  assert.equal(
    classifyLocalRequest(
      req(
        '/parkingRecommend?lat=37&lng=127&name=test&entryAt=2026-11-11T09%3A00%3A00%2B09%3A00&exitAt=2026-11-11T11%3A00%3A00%2B09%3A00',
        'GET',
        true,
      ),
      origins,
    ).allow,
    true,
  );
});

test('2시간·검색 선택·주차장과 앱 선택 화면 근거가 모두 필요하며 선호는 미확인이다', () => {
  const all = {
    recommendScreen: true,
    duration: 'two_hours',
    searchSelection: true,
    selectedParking: true,
    directionsDialog: true,
  };
  assert.equal(classifyParkingEvidence(all).verification, 'passed');
  assert.equal(
    classifyParkingEvidence({ ...all, recommendScreen: false }).verification,
    'unavailable',
  );
  assert.equal(classifyParkingEvidence({ ...all, duration: 'other' }).verification, 'not_met');
  assert.equal(
    classifyParkingEvidence({ ...all, duration: 'unavailable' }).verification,
    'unavailable',
  );
  assert.equal(
    classifyParkingEvidence({ ...all, searchSelection: null }).verification,
    'unavailable',
  );
  assert.equal(
    classifyParkingEvidence({ ...all, selectedParking: null }).verification,
    'unavailable',
  );
  assert.equal(
    classifyParkingEvidence({ ...all, directionsDialog: false }).verification,
    'not_met',
  );
  assert.equal(classifyParkingEvidence(all).evidence.preference, 'unavailable');
  const report = createLocalReport({
    mode: 'local',
    scenario: 'local-select-parking',
    persona: 'price',
    modelClaim: true,
    verification: 'passed',
    verificationReason: 'goal_observed',
    parkingEvidence: classifyParkingEvidence({ ...all, duration: 'other' }).evidence,
  });
  assert.equal(report.verification, 'unavailable');
  assert.equal(report.modelClaim, true);
  assert.doesNotMatch(JSON.stringify(report), /주차장명|좌표|https?:\/\//);
});

// 새 스모크는 기존 2시간 과제와 독립되며 목적지와 시간 근거를 모두 요구한다.
test('서울역 1시간 점검은 지정 목적지와 1시간을 확인해야 완료된다', () => {
  const args = [
    '--mode',
    'local',
    '--local-url',
    'http://localhost:3000',
    '--scenario',
    'local-one-hour-parking',
    '--model',
    'qwen3.5:9b',
  ];
  const options = parseOptions(args, {});
  assert.match(options.scenario.goal, /서울역/);
  const facts = {
    recommendScreen: true,
    duration: 'one_hour',
    searchSelection: true,
    destinationMatch: true,
    selectedParking: true,
    directionsDialog: true,
  };
  assert.equal(classifyParkingEvidence(facts, options.scenario.id).verification, 'passed');
  // 이름 또는 주소 단서가 모순되면 완료 주장만으로 통과시키지 않는다.
  assert.equal(
    classifyParkingEvidence({ ...facts, destinationAddressMatch: false }, options.scenario.id)
      .verification,
    'unavailable',
  );
  assert.equal(
    classifyParkingEvidence({ ...facts, duration: 'two_hours' }, options.scenario.id).verification,
    'not_met',
  );
  assert.equal(
    classifyParkingEvidence({ ...facts, destinationMatch: null }, options.scenario.id).verification,
    'unavailable',
  );
  assert.equal(classifyParkingEvidence({ ...facts, duration: 'one_hour' }).verification, 'not_met');
  const report = createLocalReport(
    {
      mode: 'local',
      scenario: options.scenario.id,
      persona: 'baseline',
      modelClaim: true,
      verification: 'passed',
      verificationReason: 'goal_observed',
      parkingEvidence: classifyParkingEvidence(facts, options.scenario.id).evidence,
      actionEvents: [
        {
          tool: 'browser_click',
          target: 'other_button',
          context: 'survey_modal',
          outcome: 'click_timeout',
          raw: 'secret-원문',
        },
      ],
    },
    { options },
  );
  assert.equal(report.verification, 'passed');
  assert.equal(report.actions[0].context, 'survey_modal');
  assert.doesNotMatch(JSON.stringify(report), /secret-원문/);
});

// 후보 수, 누락 및 동률은 과제 완료와 별도로 보수적으로 기록한다.
test('목록 비교는 최소 두 후보와 유일한 연결 및 완전한 값이 필요하다', async () => {
  const { sanitizeCandidateComparison } = await import('../../local-parking-logic.mjs');
  const metric = { result: 'minimum', missing: 0, minimumTies: 2 };
  const base = {
    scope: 'rendered_full_list',
    count: 3,
    selectedUnique: true,
    fee: metric,
    walking: metric,
  };
  assert.deepEqual(sanitizeCandidateComparison(base).fee, metric);
  assert.equal(sanitizeCandidateComparison({ ...base, count: 1 }).fee.result, 'unavailable');
  assert.equal(
    sanitizeCandidateComparison({ ...base, selectedUnique: false }).fee.result,
    'unavailable',
  );
  assert.equal(
    sanitizeCandidateComparison({ ...base, fee: { ...metric, missing: 1 } }).fee.result,
    'unavailable',
  );
  assert.equal(
    sanitizeCandidateComparison({ ...base, fee: { ...metric, minimumTies: 4 } }).fee.result,
    'unavailable',
  );
});
