import assert from 'node:assert/strict';
import test from 'node:test';
import { createDataFingerprint, compareDataFingerprints } from '../../local-data-fingerprint.mjs';

// 모든 요청과 응답의 동일성만 판정하고 원문과 키는 결과에 남기지 않는다.
test('조회 전체의 요청·응답이 같아야 같고 누락·차이는 미확인 또는 다름이다', () => {
  const key = Buffer.alloc(32, 7);
  const build = (change = false, missing = false, secret = 'PRIVATE') => {
    const tracker = createDataFingerprint(key);
    for (const [path, body] of [
      [
        '/api/parking/viewport?southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128',
        'map',
      ],
      ['/api/destinations/search?query=PRIVATE&latitude=37&longitude=127', 'dest'],
      [
        '/api/parking/search?destinationLatitude=37&destinationLongitude=127&entryAt=1&exitAt=2',
        change ? 'changed' : 'parking',
      ],
    ]) {
      if (missing && path.includes('/destinations/')) continue;
      tracker.record({
        method: 'GET',
        url: `http://localhost:3000${path}`,
        headers: { cookie: secret },
        status: 200,
        body: Buffer.from(body),
      });
    }
    tracker.record({
      method: 'GET',
      url: 'https://map.pstatic.net/synthetic',
      headers: {},
      status: 200,
      body: Buffer.from('tile'),
      reason: 'map_resource',
    });
    return tracker.finish();
  };
  const a = build(),
    b = build();
  assert.equal(compareDataFingerprints([a, b, a, b, a, b]), 'same');
  assert.equal(compareDataFingerprints([a, b, a, b, a, build(true)]), 'different');
  assert.equal(compareDataFingerprints([a, b, a, b, a, build(false, true)]), 'unavailable');
  assert.equal(compareDataFingerprints([a, b, a, b, a, build(false, false, 'OTHER')]), 'different');
  assert.doesNotMatch(JSON.stringify(a), /PRIVATE|localhost|cookie|"map"|"dest"|"parking"/);
  const wrongDuration = createDataFingerprint(key, { expectedDurationMs: 3600000 });
  for (const path of [
    '/api/parking/viewport?southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128',
    '/api/destinations/search?query=x&latitude=37&longitude=127',
  ])
    wrongDuration.record({
      method: 'GET',
      url: `http://localhost${path}`,
      headers: {},
      status: 200,
      body: Buffer.from('{}'),
    });
  wrongDuration.record({
    method: 'GET',
    url: 'https://map.pstatic.net/synthetic',
    headers: {},
    status: 200,
    body: Buffer.from('tile'),
    reason: 'map_resource',
  });
  wrongDuration.record({
    method: 'GET',
    url: 'http://localhost/api/parking/search?destinationLatitude=37&destinationLongitude=127&entryAt=2026-11-11T09%3A00%3A00%2B09%3A00&exitAt=2026-11-11T11%3A00%3A00%2B09%3A00',
    headers: {},
    status: 200,
    body: Buffer.from('{}'),
  });
  assert.equal(wrongDuration.finish().complete, false);
});

// 세션별 헤더와 지도 오류를 핵심 주차 조회의 결과와 혼동하지 않는다.
test('핵심 조회는 동일 쿼리·응답, 쿼리 차이, 응답 차이와 불충분을 구분한다', async () => {
  const { compareCoreParking } = await import('../../local-data-fingerprint.mjs');
  const key = Buffer.alloc(32, 8);
  const make = ({
    headers = {},
    body = 'DATA',
    status = 200,
    lat = '37',
    verifiedLat = lat,
    missing = false,
    multi = false,
    mapError = false,
  } = {}) => {
    const f = createDataFingerprint(key, { expectedDurationMs: 3600000 });
    if (!missing) {
      const request = (latitude, text) =>
        f.record({
          method: 'GET',
          url: `http://localhost/api/parking/search?destinationLatitude=${latitude}&destinationLongitude=127&entryAt=2026-11-11T09%3A00%3A00%2B09%3A00&exitAt=2026-11-11T10%3A00%3A00%2B09%3A00`,
          headers,
          status,
          body: Buffer.from(text),
        });
      request(lat, body);
      if (multi) request('38', body);
    }
    if (mapError) f.fail('map_resource');
    f.bindVerifiedDestination(verifiedLat, '127');
    return f.finish();
  };
  const a = make({ headers: { cookie: 'one' } }),
    b = make({ headers: { cookie: 'two' }, mapError: true });
  assert.equal(compareCoreParking(a, b), 'same_query_same_response');
  assert.equal(compareCoreParking(a, make({ body: 'OTHER' })), 'same_query_different_response');
  assert.equal(compareCoreParking(a, make({ status: 201 })), 'same_query_different_response');
  assert.equal(compareCoreParking(a, make({ lat: '38' })), 'different_request');
  assert.equal(compareCoreParking(a, make({ verifiedLat: '38' })), 'unavailable');
  assert.equal(compareCoreParking(a, make({ missing: true })), 'unavailable');
  assert.equal(compareCoreParking(a, make({ multi: true })), 'unavailable');
  const failedSearch = createDataFingerprint(key, { expectedDurationMs: 3600000 });
  failedSearch.fail('http://localhost/api/parking/search');
  failedSearch.record({
    method: 'GET',
    url: 'http://localhost/api/parking/search?destinationLatitude=37&destinationLongitude=127&entryAt=2026-11-11T09%3A00%3A00%2B09%3A00&exitAt=2026-11-11T10%3A00%3A00%2B09%3A00',
    headers: {},
    status: 200,
    body: Buffer.from('DATA'),
  });
  failedSearch.bindVerifiedDestination('37', '127');
  assert.equal(compareCoreParking(a, failedSearch.finish()), 'unavailable');
});
