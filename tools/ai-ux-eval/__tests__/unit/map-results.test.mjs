import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyMapError, installLocalSafety, mapRequestKind } from '../../local-safety.mjs';

// fetch 오류와 브라우저 이벤트가 같은 요청을 두 번 세지 않도록 보호한다.
test('지도 상태와 오류를 고정 범주로 한 번만 기록한다', async () => {
  const handlers = {};
  const context = {
    addInitScript: async () => {},
    routeWebSocket: async () => {},
    route: async (_p, h) => {
      handlers.route = h;
    },
    on: (name, h) => {
      handlers[name] = h;
    },
  };
  const origins = { appOrigin: 'http://127.0.0.1:3000', wrapperOrigin: 'http://127.0.0.1:3001' };
  const stats = await installLocalSafety(context, origins);
  const req = (url) => ({
    url: () => url,
    method: () => 'GET',
    resourceType: () => 'script',
    isNavigationRequest: () => false,
  });
  const failed = req('https://oapi.map.naver.com/openapi/v3/maps.js?key=synthetic-secret');
  await handlers.route({
    request: () => failed,
    fetch: async () => {
      throw Object.assign(new Error('synthetic-secret ENOTFOUND'), { code: 'ENOTFOUND' });
    },
    abort: async () => handlers.requestfailed(failed),
  });
  const statusReq = req('https://oapi.map.naver.com/openapi/v3/maps.js?key=synthetic-secret');
  const ok = { request: () => statusReq, url: () => statusReq.url(), status: () => 200 };
  await handlers.route({
    request: () => statusReq,
    fetch: async () => ok,
    fulfill: async () => {
      handlers.response(ok);
      handlers.requestfailed(statusReq);
    },
  });
  const unauthorizedReq = req('https://oapi.map.naver.com/another?key=synthetic-secret');
  const unauthorized = {
    request: () => unauthorizedReq,
    url: () => unauthorizedReq.url(),
    status: () => 401,
  };
  await handlers.route({
    request: () => unauthorizedReq,
    fetch: async () => unauthorized,
    fulfill: async () => {
      handlers.response(unauthorized);
      handlers.requestfailed(unauthorizedReq);
    },
  });
  const responseReq = req('https://oapi.map.naver.com/other?key=synthetic-secret');
  const response = { request: () => responseReq, url: () => responseReq.url(), status: () => 503 };
  await handlers.route({
    request: () => responseReq,
    fetch: async () => response,
    fulfill: async () => {
      handlers.response(response);
      handlers.requestfailed(responseReq);
    },
  });
  const blocked = req('http://oapi.map.naver.com/another?key=synthetic-secret');
  await handlers.route({
    request: () => blocked,
    abort: async () => handlers.requestfailed(blocked),
  });
  assert.equal(stats.mapFailures, 4);
  assert.equal(stats.mapResponses, 1);
  assert.deepEqual(stats.mapResults, [
    { kind: 'sdk_script', outcome: 'dns', status: null, count: 1 },
    { kind: 'sdk_script', outcome: 'http', status: 200, count: 1 },
    { kind: 'other_map_resource', outcome: 'http', status: 401, count: 1 },
    { kind: 'other_map_resource', outcome: 'http', status: 503, count: 1 },
    { kind: 'other_map_resource', outcome: 'policy_blocked', status: null, count: 1 },
  ]);
  assert.doesNotMatch(JSON.stringify(stats), /synthetic-secret|naver|https?:/);
});

test('확인할 수 없는 지도 오류를 추정하지 않는다', () => {
  assert.equal(classifyMapError({ code: 'CERT_HAS_EXPIRED' }), 'tls');
  assert.equal(classifyMapError({ cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } }), 'tls');
  assert.equal(classifyMapError({ name: 'TimeoutError' }), 'timeout');
  assert.equal(classifyMapError(new Error('unclassified')), 'unknown');
  assert.equal(mapRequestKind('not a url'), 'other_map_resource');
});
