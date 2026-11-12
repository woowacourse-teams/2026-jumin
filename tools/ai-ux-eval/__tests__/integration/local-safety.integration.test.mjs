import assert from 'node:assert/strict';
import test from 'node:test';
import { probeLocalSafety } from '../../local-safety-probe.mjs';

// 별도 로컬 서버에 대한 실제 브라우저 요청으로 차단이 서버 도달 전에 이뤄지는지 확인한다.
test('첫 스크립트 전 분석 제외와 조회만 허용하는 보호 정책을 적용한다', async () => {
  const result = await probeLocalSafety();
  assert.equal(result.passed, true, JSON.stringify(result));
  assert.equal(result.firstScriptOptOut, true);
  assert.equal(result.serviceWorkersBlocked, true);
  assert.equal(result.allowedLookupReachedServer, true);
  assert.equal(result.blockedWritesReachedServer, 0);
  assert.equal(result.redirectTargetRequestsReachedServer, 0);
  assert.ok(result.redirectsBlocked >= 1);
  assert.equal(result.methodOverridesReachedServer, 0);
  assert.ok(result.methodOverridesBlocked >= 1);
  assert.equal(result.analyticsRequestsReachedServer, 0);
  assert.equal(result.webSocketsReachedServer, 0);
  assert.equal(result.externalProtocolBlocked, true);
});
