import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedDevBackend,
  classifyLocalRequest,
  redactLocalText,
  safeDevEnvironment,
  summarizeBlockedRequest,
} from '../../local-safety.mjs';
import { readLocalSnapshot } from '../../local-smoke.mjs';

const origins = { appOrigin: 'http://127.0.0.1:3000', wrapperOrigin: 'http://127.0.0.1:4567' };
const request = (url, overrides = {}) =>
  classifyLocalRequest(
    { url, method: 'GET', resourceType: 'fetch', navigation: false, topLevel: false, ...overrides },
    origins,
  );

// 홈 화면에 필요한 조회만 허용하고 같은 출처의 쓰기와 우회 경로도 차단한다.
test('dev 조회 허용 목록과 쓰기·분석·외부 이동 차단을 구분한다', () => {
  const base = 'http://127.0.0.1:3000';
  const query = '?southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128';
  assert.equal(request(`${base}/api/parking/viewport${query}`).allow, true);
  assert.equal(request(`${base}/api/parking/viewport${query}`, { method: 'POST' }).reason, 'write');
  assert.equal(request(`${base}/api/parking/1/like`, { method: 'POST' }).reason, 'write');
  assert.equal(request(`${base}/api/reports`, { method: 'POST' }).reason, 'write');
  assert.equal(request(`${base}/api/admin/parking/review`).allow, false);
  assert.equal(request(`${base}/api/parking/viewport${query}&extra=secret`).allow, false);
  assert.equal(request(`${base}/api%2Fparking/viewport${query}`).allow, false);
  assert.equal(request('https://www.google-analytics.com/g/collect').reason, 'analytics');
  assert.equal(request('https://www.clarity.ms/collect').reason, 'analytics');
  assert.equal(request('https://o1.ingest.sentry.io/api/1/envelope/').reason, 'analytics');
  assert.equal(
    request('https://oapi.map.naver.com/openapi/v3/maps.js', { resourceType: 'script' }).allow,
    true,
  );
  assert.equal(
    request('https://oapi.map.naver.com/openapi/v3/maps.js', { navigation: true, topLevel: false })
      .allow,
    false,
  );
  assert.equal(request(`${base}/`, { navigation: true, topLevel: true }).allow, false);
  assert.equal(
    request(`${origins.wrapperOrigin}/`, { navigation: true, topLevel: true }).allow,
    true,
  );
  assert.equal(request('https://example.com/', { navigation: true, topLevel: true }).allow, false);
});

// 원본 주소와 인증 정보는 버리고 전송 방식만 구분한다.
test('차단 진단은 전송 방식을 분류하며 URL 정보를 보관하지 않는다', () => {
  const input = {
    url: 'http://oapi.map.naver.com/secret?key=private',
    method: 'GET',
    resourceType: 'script',
    navigation: false,
    topLevel: false,
  };
  const result = summarizeBlockedRequest(input, origins, 'external');
  assert.equal(result.transport, 'http');
  assert.equal(result.category, 'map');
  assert.doesNotMatch(JSON.stringify(result), /secret|private|naver/);
  assert.equal(request(input.url, { resourceType: 'script' }).reason, 'external');
});

test('프런트 환경에서 분석 ID를 비우고 허용된 dev 대상만 사용한다', () => {
  assert.equal(allowedDevBackend('https://dev.jucha.info'), 'https://dev.jucha.info');
  assert.equal(allowedDevBackend('https://origin-dev.jucha.info'), 'https://origin-dev.jucha.info');
  assert.equal(allowedDevBackend('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
  for (const url of [
    'https://jucha.info',
    'https://dev.jucha.info.example.com',
    'https://user:secret@dev.jucha.info',
    'https://dev.jucha.info/api',
  ])
    assert.equal(allowedDevBackend(url), null);
  const original = {
    GA_MEASUREMENT_ID: 'synthetic',
    CLARITY_PROJECT_ID: 'synthetic',
    SENTRY_DSN: 'synthetic',
    SENTRY_AUTH_TOKEN: 'synthetic',
  };
  const child = safeDevEnvironment(original, 'https://dev.jucha.info');
  assert.equal(child.GA_MEASUREMENT_ID, '');
  assert.equal(child.CLARITY_PROJECT_ID, '');
  assert.equal(child.SENTRY_DSN, '');
  assert.equal(child.SENTRY_AUTH_TOKEN, undefined);
  assert.equal(child.pnpm_config_verify_deps_before_run, 'false');
  assert.equal(original.SENTRY_AUTH_TOKEN, 'synthetic');
});

test('실제 화면을 모델에 전달하기 전에 지도 키와 대표 개인정보 패턴을 가린다', () => {
  const raw = 'synthetic-map-key sample.person@example.com 010-1234-5678';
  const safe = redactLocalText(raw, 'synthetic-map-key');
  assert.doesNotMatch(safe, /synthetic-map-key|sample\.person@example\.com|010-1234-5678/);
});

// MCP 응답이 파일 링크로 바뀌더라도 로컬 화면 기록을 읽거나 사용하지 않는다.
test('로컬 스냅샷은 본문으로만 받고 파일 링크를 거부한다', async () => {
  const signal = new AbortController().signal;
  const client = (text) => ({ callTool: async () => ({ content: [{ type: 'text', text }] }) });
  const inline = await readLocalSnapshot(client('### Snapshot\n- button "검색"'), '', signal);
  assert.match(inline, /button/);
  await assert.rejects(
    readLocalSnapshot(client('[Snapshot](/tmp/synthetic.yml)'), '', signal),
    (error) => error.reason === 'snapshot_error',
  );
});
