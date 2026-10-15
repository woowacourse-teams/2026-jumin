import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE_URL = (__ENV.LOADTEST_BASE_URL || '').replace(/\/+$/, '');
const LOAD_PROFILE = __ENV.LOAD_PROFILE || 'both';
const VIEWPORT_RPS = Number(__ENV.VIEWPORT_RPS || '0.7');
const RECOMMENDATION_RPS = Number(__ENV.RECOMMENDATION_RPS || '0.05');
const DURATION = __ENV.DURATION || '10m';
const PRE_ALLOCATED_VUS = Number(__ENV.PRE_ALLOCATED_VUS || '5');
const MAX_VUS = Number(__ENV.MAX_VUS || '8');
const MAX_TARGET_RPS = Number(__ENV.MAX_TARGET_RPS || '8');
const ABSOLUTE_MAX_TARGET_RPS = 324;
const VIEWPORT_PATTERN = __ENV.VIEWPORT_PATTERN || 'fixed';
const DESTINATION_LATITUDE = __ENV.DESTINATION_LATITUDE;
const DESTINATION_LONGITUDE = __ENV.DESTINATION_LONGITUDE;
const ENTRY_AT = __ENV.ENTRY_AT;
const EXIT_AT = __ENV.EXIT_AT;
const WEST_LONGITUDE = Number(__ENV.VIEWPORT_WEST_LONGITUDE || '127.0200');
const SOUTH_LATITUDE = Number(__ENV.VIEWPORT_SOUTH_LATITUDE || '37.4920');
const EAST_LONGITUDE = Number(__ENV.VIEWPORT_EAST_LONGITUDE || '127.0350');
const NORTH_LATITUDE = Number(__ENV.VIEWPORT_NORTH_LATITUDE || '37.5040');

const endpointMetrics = {
  viewport: createEndpointMetrics('viewport'),
  recommendation: createEndpointMetrics('recommendation'),
};

function createEndpointMetrics(endpoint) {
  return {
    requests: new Counter(`${endpoint}_requests`),
    slowRequests: new Counter(`${endpoint}_over_5s`),
    failures: new Counter(`${endpoint}_failures`),
    httpErrors: new Counter(`${endpoint}_http_errors`),
    timeouts: new Counter(`${endpoint}_timeouts`),
    contractFailures: new Counter(`${endpoint}_contract_failures`),
    failureRate: new Rate(`${endpoint}_failure_rate`),
    slowRate: new Rate(`${endpoint}_slow_rate`),
  };
}

const baseUrlMatch = /^(https?):\/\/([^/?#]+)$/i.exec(BASE_URL);
const durationMatch = /^(\d+)(s|m|h)$/.exec(DURATION);

if (__ENV.LOADTEST_ENV !== 'local') {
  throw new Error('LOADTEST_ENV=local 로 설정한 로컬 테스트 환경에서만 실행할 수 있습니다.');
}

if (!baseUrlMatch || baseUrlMatch[2].includes('@')) {
  throw new Error('LOADTEST_BASE_URL에는 인증 정보나 경로가 없는 격리 환경의 origin을 지정하세요.');
}

const hostname = baseUrlMatch[2].replace(/:\d+$/, '').toLowerCase();
if (hostname === 'jucha.info' || hostname.endsWith('.jucha.info')) {
  throw new Error('운영·개발 도메인에서는 부하 테스트를 실행할 수 없습니다.');
}

if (!['localhost', '127.0.0.1', 'nginx'].includes(hostname)) {
  throw new Error('로컬 테스트는 localhost, 127.0.0.1 또는 Compose의 nginx 서비스만 대상으로 합니다.');
}

if (!['both', 'viewport', 'recommendation'].includes(LOAD_PROFILE)) {
  throw new Error('LOAD_PROFILE은 both, viewport, recommendation 중 하나여야 합니다.');
}

if (!['fixed', 'grid'].includes(VIEWPORT_PATTERN)) {
  throw new Error('VIEWPORT_PATTERN은 fixed 또는 grid여야 합니다.');
}

const usesRecommendation = LOAD_PROFILE === 'both' || LOAD_PROFILE === 'recommendation';

validateRps('VIEWPORT_RPS', VIEWPORT_RPS);
validateRps('RECOMMENDATION_RPS', RECOMMENDATION_RPS);

if (!durationMatch || Number(durationMatch[1]) <= 0) {
  throw new Error('DURATION은 10m처럼 양수와 s, m, h 단위로 지정하세요.');
}

if (!Number.isInteger(PRE_ALLOCATED_VUS)
    || PRE_ALLOCATED_VUS < 1
    || !Number.isInteger(MAX_VUS)
    || MAX_VUS < PRE_ALLOCATED_VUS) {
  throw new Error('PRE_ALLOCATED_VUS와 MAX_VUS는 양의 정수여야 하며 MAX_VUS는 그 이상이어야 합니다.');
}

if (!Number.isFinite(MAX_TARGET_RPS) || MAX_TARGET_RPS < 1 || MAX_TARGET_RPS > ABSOLUTE_MAX_TARGET_RPS) {
  throw new Error(`MAX_TARGET_RPS는 1 이상 ${ABSOLUTE_MAX_TARGET_RPS} 이하로 지정하세요.`);
}

if (![WEST_LONGITUDE, SOUTH_LATITUDE, EAST_LONGITUDE, NORTH_LATITUDE].every(Number.isFinite)
    || WEST_LONGITUDE < -180 || WEST_LONGITUDE > 180
    || EAST_LONGITUDE < -180 || EAST_LONGITUDE > 180
    || SOUTH_LATITUDE <= -90 || SOUTH_LATITUDE >= 90
    || NORTH_LATITUDE <= -90 || NORTH_LATITUDE >= 90
    || WEST_LONGITUDE >= EAST_LONGITUDE
    || SOUTH_LATITUDE >= NORTH_LATITUDE) {
  throw new Error('Viewport bbox 좌표 범위와 서·남/동·북 순서를 확인하세요.');
}

const latitude = Number(DESTINATION_LATITUDE);
const longitude = Number(DESTINATION_LONGITUDE);
if (usesRecommendation) {
  if (!DESTINATION_LATITUDE || !DESTINATION_LONGITUDE || !ENTRY_AT || !EXIT_AT) {
    throw new Error('추천 검색 목적지 좌표, ENTRY_AT, EXIT_AT을 모두 지정하세요.');
  }

  const seoulDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:(00|10|20|30|40|50):00\+09:00$/;
  if (!seoulDateTimePattern.test(ENTRY_AT) || !seoulDateTimePattern.test(EXIT_AT)) {
    throw new Error('ENTRY_AT과 EXIT_AT은 초가 00이고 10분 단위인 서울 시각이어야 합니다.');
  }

  const entryTimestamp = Date.parse(ENTRY_AT);
  const exitTimestamp = Date.parse(EXIT_AT);
  if (!Number.isFinite(entryTimestamp)
      || !Number.isFinite(exitTimestamp)
      || entryTimestamp <= Date.now()
      || exitTimestamp <= entryTimestamp
      || exitTimestamp - entryTimestamp > 24 * 60 * 60 * 1000) {
    throw new Error('입차 시각은 미래여야 하며, 출차 시각은 입차 후 24시간 이내여야 합니다.');
  }

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('추천 검색 목적지 좌표 범위를 확인하세요.');
  }
}

const scenarios = {};
if (LOAD_PROFILE === 'both' || LOAD_PROFILE === 'viewport') {
  scenarios.viewport = arrivalRateScenario(VIEWPORT_RPS, 'viewport');
}
if (LOAD_PROFILE === 'both' || LOAD_PROFILE === 'recommendation') {
  scenarios.recommendation = arrivalRateScenario(RECOMMENDATION_RPS, 'recommendation');
}

export const options = {
  discardResponseBodies: false,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],
  scenarios,
  thresholds: {
    'http_req_duration{endpoint:viewport}': ['p(95)<237'],
    'http_req_duration{endpoint:recommendation}': ['p(95)<2170'],
    viewport_failures: ['count==0'],
    viewport_over_5s: ['count==0'],
    recommendation_failures: ['count==0'],
    recommendation_over_5s: ['count==0'],
    dropped_iterations: ['count==0'],
  },
};

function arrivalRateScenario(targetRps, endpoint) {
  return {
    executor: 'constant-arrival-rate',
    rate: Math.ceil(targetRps * 60),
    timeUnit: '1m',
    duration: DURATION,
    preAllocatedVUs: PRE_ALLOCATED_VUS,
    maxVUs: MAX_VUS,
    gracefulStop: '30s',
    exec: endpoint,
  };
}

function validateRps(name, value) {
  if (!Number.isFinite(value) || value < 1 / 60 || value > MAX_TARGET_RPS) {
    throw new Error(`${name}는 1분당 1회 이상, 설정한 상한 ${MAX_TARGET_RPS} RPS 이하로 지정하세요.`);
  }
}

export function viewport() {
  const bounds = viewportBounds();
  const query = [
    `westLongitude=${encodeURIComponent(bounds.westLongitude)}`,
    `southLatitude=${encodeURIComponent(bounds.southLatitude)}`,
    `eastLongitude=${encodeURIComponent(bounds.eastLongitude)}`,
    `northLatitude=${encodeURIComponent(bounds.northLatitude)}`,
  ].join('&');

  const response = http.get(`${BASE_URL}/api/parking/viewport?${query}`, {
    redirects: 0,
    timeout: '60s',
    tags: { endpoint: 'viewport', name: 'GET /api/parking/viewport' },
  });

  let hasValidContract = false;
  try {
    if (response.status === 200) {
      hasValidContract = isValidViewportResponse(response.json());
    }
  } catch (_) {
    hasValidContract = false;
  }

  recordResponse('viewport', response, hasValidContract);
}

function viewportBounds() {
  if (VIEWPORT_PATTERN === 'fixed') {
    return {
      westLongitude: WEST_LONGITUDE,
      southLatitude: SOUTH_LATITUDE,
      eastLongitude: EAST_LONGITUDE,
      northLatitude: NORTH_LATITUDE,
    };
  }

  const gridIndex = (__VU + __ITER) % 16;
  const longitudeOffset = (gridIndex % 4 - 1.5) * 0.001;
  const latitudeOffset = (Math.floor(gridIndex / 4) - 1.5) * 0.001;

  return {
    westLongitude: WEST_LONGITUDE + longitudeOffset,
    southLatitude: SOUTH_LATITUDE + latitudeOffset,
    eastLongitude: EAST_LONGITUDE + longitudeOffset,
    northLatitude: NORTH_LATITUDE + latitudeOffset,
  };
}

export function recommendation() {
  const query = [
    `destinationLatitude=${encodeURIComponent(latitude)}`,
    `destinationLongitude=${encodeURIComponent(longitude)}`,
    `entryAt=${encodeURIComponent(ENTRY_AT)}`,
    `exitAt=${encodeURIComponent(EXIT_AT)}`,
  ].join('&');

  const response = http.get(`${BASE_URL}/api/parking/search?${query}`, {
    redirects: 0,
    timeout: '60s',
    tags: { endpoint: 'recommendation', name: 'GET /api/parking/search' },
  });

  let hasValidContract = false;
  try {
    if (response.status === 200) {
      hasValidContract = isValidRecommendationResponse(response.json());
    }
  } catch (_) {
    hasValidContract = false;
  }

  recordResponse('recommendation', response, hasValidContract);
}

function recordResponse(endpoint, response, hasValidContract) {
  const metrics = endpointMetrics[endpoint];
  metrics.requests.add(1);

  const responseDurationMs = Number(response.timings?.duration);
  const isSlow = Number.isFinite(responseDurationMs) && responseDurationMs > 5000;
  metrics.slowRate.add(isSlow);
  if (isSlow) {
    metrics.slowRequests.add(1);
  }

  const isHttpSuccessful = response.status === 200;
  const isSuccessful = isHttpSuccessful && hasValidContract;
  metrics.failureRate.add(!isSuccessful);

  if (!isHttpSuccessful) {
    metrics.httpErrors.add(1);
  }

  if (response.status === 0 && /timeout/i.test(response.error || '')) {
    metrics.timeouts.add(1);
  }

  if (isHttpSuccessful && !hasValidContract) {
    metrics.contractFailures.add(1);
  }

  if (!isSuccessful) {
    metrics.failures.add(1);
  }

  check(response, {
    'HTTP 200': (result) => result.status === 200,
    [`${endpoint} 응답 계약이 유효하고 결과가 있음`]: () => hasValidContract,
  }, { endpoint });
}

function isValidViewportResponse(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)
      || !Number.isInteger(body.totalCount)
      || !Array.isArray(body.parkingLots)
      || body.totalCount <= 0
      || body.totalCount !== body.parkingLots.length) {
    return false;
  }

  return body.parkingLots.every((parkingLot) => parkingLot !== null
    && typeof parkingLot === 'object'
    && !Array.isArray(parkingLot)
    && Number.isInteger(parkingLot.id)
    && typeof parkingLot.latitude === 'number'
    && Number.isFinite(parkingLot.latitude)
    && parkingLot.latitude >= -90
    && parkingLot.latitude <= 90
    && typeof parkingLot.longitude === 'number'
    && Number.isFinite(parkingLot.longitude)
    && parkingLot.longitude >= -180
    && parkingLot.longitude <= 180);
}

function isValidRecommendationResponse(body) {
  const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
  const isNullableNumber = (value) => value === null || isFiniteNumber(value);

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }

  if (body.searchRadiusMeters !== 600
      || !Number.isInteger(body.totalCount)
      || !Array.isArray(body.parkingLots)
      || body.parkingLots.length === 0
      || body.totalCount !== body.parkingLots.length) {
    return false;
  }

  return body.parkingLots.every((parkingLot) => {
    if (parkingLot === null || typeof parkingLot !== 'object' || Array.isArray(parkingLot)) {
      return false;
    }

    const location = parkingLot.location;
    return isFiniteNumber(parkingLot.id)
      && typeof parkingLot.name === 'string'
      && typeof parkingLot.address === 'string'
      && location !== null
      && typeof location === 'object'
      && isFiniteNumber(location.latitude)
      && location.latitude >= -90
      && location.latitude <= 90
      && isFiniteNumber(location.longitude)
      && location.longitude >= -180
      && location.longitude <= 180
      && isNullableNumber(parkingLot.distanceMeters)
      && isNullableNumber(parkingLot.walkingDurationMinutes)
      && isNullableNumber(parkingLot.estimatedFee)
      && isNullableNumber(parkingLot.balancedScore)
      && ['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'].includes(parkingLot.availabilityStatus);
  });
}
