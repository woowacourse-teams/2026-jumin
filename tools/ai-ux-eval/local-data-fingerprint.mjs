import { createHmac } from 'node:crypto';

// 요청과 본문은 메모리에서만 처리한다. 키와 개별 지문은 저장하지 않는다.
export function createDataFingerprint(key, { expectedDurationMs = null } = {}) {
  if (!Buffer.isBuffer(key) || key.length < 32) throw Error('비교 키 오류');
  const entries = [];
  const coreEntries = [];
  let coreFailed = false;
  let verifiedDestination = null;
  const coverage = {
    viewport: 0,
    destinationSearch: 0,
    parkingSearch: 0,
    mapResource: 0,
    other: 0,
  };
  let failed = false;
  const hmac = (parts) => {
    const h = createHmac('sha256', key);
    for (const part of parts) {
      const b = Buffer.isBuffer(part) ? part : Buffer.from(String(part));
      const size = Buffer.alloc(8);
      size.writeBigUInt64BE(BigInt(b.length));
      h.update(size);
      h.update(b);
    }
    return h.digest('hex');
  };
  return {
    record({ method, url, headers, status, body, reason }) {
      try {
        const parsed = new URL(url);
        const kind =
          reason === 'map_resource'
            ? 'mapResource'
            : parsed.pathname === '/api/parking/viewport'
              ? 'viewport'
              : parsed.pathname === '/api/destinations/search'
                ? 'destinationSearch'
                : parsed.pathname === '/api/parking/search'
                  ? 'parkingSearch'
                  : 'other';
        coverage[kind]++;
        if (
          method !== 'GET' ||
          !Number.isInteger(status) ||
          status < 200 ||
          status >= 300 ||
          !Buffer.isBuffer(body)
        ) {
          failed = true;
          if (kind === 'parkingSearch') coreFailed = true;
          return;
        }
        const required = {
          viewport: ['southLatitude', 'westLongitude', 'northLatitude', 'eastLongitude'],
          destinationSearch: ['query', 'latitude', 'longitude'],
          parkingSearch: ['destinationLatitude', 'destinationLongitude', 'entryAt', 'exitAt'],
          mapResource: [],
          other: [],
        }[kind];
        if (
          required.some(
            (field) =>
              parsed.searchParams.getAll(field).length !== 1 || !parsed.searchParams.get(field),
          )
        ) {
          failed = true;
          if (kind === 'parkingSearch') coreFailed = true;
          return;
        }
        if (kind === 'parkingSearch' && expectedDurationMs !== null) {
          const entry = Date.parse(parsed.searchParams.get('entryAt'));
          const exit = Date.parse(parsed.searchParams.get('exitAt'));
          if (
            !Number.isFinite(entry) ||
            !Number.isFinite(exit) ||
            exit - entry !== expectedDurationMs
          ) {
            failed = true;
            coreFailed = true;
            return;
          }
        }
        const params = [...parsed.searchParams.entries()].sort(
          ([a, b], [c, d]) => a.localeCompare(c) || b.localeCompare(d),
        );
        if (kind === 'parkingSearch') {
          const latitude = Number(parsed.searchParams.get('destinationLatitude'));
          const longitude = Number(parsed.searchParams.get('destinationLongitude'));
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            failed = true;
            coreFailed = true;
            return;
          }
          coreEntries.push({
            request: hmac([method, parsed.pathname, JSON.stringify(params)]),
            response: hmac([status, body]),
            destination: hmac(['destination', String(latitude), String(longitude)]),
          });
        }
        const sortedHeaders = Object.entries(headers)
          .map(([k, v]) => [k.toLowerCase(), v])
          .sort(([a], [b]) => a.localeCompare(b));
        entries.push(
          hmac([
            method,
            parsed.origin,
            parsed.pathname,
            JSON.stringify(params),
            JSON.stringify(sortedHeaders),
            status,
            body,
          ]),
        );
      } catch {
        failed = true;
        coreFailed = true;
      }
    },
    fail(failedUrlOrKind) {
      failed = true;
      if (failedUrlOrKind === 'map_resource' || failedUrlOrKind === 'blocked_non_read') return;
      try {
        const url = new URL(failedUrlOrKind);
        if (url.pathname === '/api/parking/search') coreFailed = true;
      } catch {
        coreFailed = true;
      }
    },
    bindVerifiedDestination(latitude, longitude) {
      const lat = Number(latitude),
        lng = Number(longitude);
      if (
        typeof latitude !== 'string' ||
        typeof longitude !== 'string' ||
        !latitude.trim() ||
        !longitude.trim() ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      )
        return;
      verifiedDestination = hmac(['destination', String(lat), String(lng)]);
    },
    finish() {
      const complete =
        !failed &&
        coverage.viewport > 0 &&
        coverage.destinationSearch > 0 &&
        coverage.parkingSearch > 0 &&
        coverage.mapResource > 0 &&
        entries.length > 0;
      const coreRequests = new Set(coreEntries.map((item) => item.request));
      const coreResponses = new Set(coreEntries.map((item) => item.response));
      const coreComplete =
        !coreFailed &&
        expectedDurationMs !== null &&
        coreEntries.length > 0 &&
        verifiedDestination !== null &&
        coreEntries.every((item) => item.destination === verifiedDestination) &&
        coreRequests.size === 1 &&
        coreResponses.size === 1;
      return {
        complete,
        count: entries.length,
        coverage: { ...coverage },
        digest: complete ? hmac(entries.sort()) : null,
        core: {
          complete: coreComplete,
          count: coreEntries.length,
          request: coreComplete ? coreEntries[0].request : null,
          response: coreComplete ? coreEntries[0].response : null,
        },
      };
    },
  };
}

// 동일 시간·목적지 핵심 조회만 비교하며, 세션 헤더와 나머지 탐색 경로는 포함하지 않는다.
export function compareCoreParking(a, b) {
  if (
    !a?.core?.complete ||
    !b?.core?.complete ||
    ![a.core.request, a.core.response, b.core.request, b.core.response].every(
      (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
    )
  )
    return 'unavailable';
  if (a.core.request !== b.core.request) return 'different_request';
  return a.core.response === b.core.response
    ? 'same_query_same_response'
    : 'same_query_different_response';
}

// 여섯 세션의 전체 조회 멀티셋이 완전하고 동일한 경우만 같다.
export function compareDataFingerprints(proofs) {
  if (
    !Array.isArray(proofs) ||
    proofs.length !== 6 ||
    proofs.some((p) => !p?.complete || !/^[a-f0-9]{64}$/.test(p.digest || ''))
  )
    return 'unavailable';
  return proofs.every((p) => p.digest === proofs[0].digest) ? 'same' : 'different';
}

// 전체 트랜잭션 차이는 헤더·경로·응답 중 어느 차이인지 추정하지 않는다.
export function compareTransactionPair(a, b) {
  if (
    !a?.complete ||
    !b?.complete ||
    ![a.digest, b.digest].every((x) => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x))
  )
    return 'unavailable';
  return a.digest === b.digest ? 'same_transactions' : 'transaction_difference';
}
