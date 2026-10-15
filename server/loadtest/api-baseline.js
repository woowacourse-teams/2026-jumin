import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.LOADTEST_BASE_URL || '').replace(/\/+$/, '');
const API_NAME = __ENV.API_NAME || '';
const MODE = __ENV.BASELINE_MODE || 'measure';
const ITERATIONS = Number(__ENV.BASELINE_ITERATIONS || '60');
const PARKING_LOT_ID = Number(__ENV.PARKING_LOT_ID || '3136');
const THINK_TIME_SECONDS = Number(__ENV.THINK_TIME_SECONDS || '2');
const LATITUDE = Number(__ENV.DESTINATION_LATITUDE || '37.49795');
const LONGITUDE = Number(__ENV.DESTINATION_LONGITUDE || '127.02756');
const WEST_LONGITUDE = Number(__ENV.VIEWPORT_WEST_LONGITUDE || '127.0200');
const SOUTH_LATITUDE = Number(__ENV.VIEWPORT_SOUTH_LATITUDE || '37.4920');
const EAST_LONGITUDE = Number(__ENV.VIEWPORT_EAST_LONGITUDE || '127.0350');
const NORTH_LATITUDE = Number(__ENV.VIEWPORT_NORTH_LATITUDE || '37.5040');
const ENTRY_AT = __ENV.ENTRY_AT || '';
const EXIT_AT = __ENV.EXIT_AT || '';
const ADMIN_LOGIN_ID = __ENV.ADMIN_LOGIN_ID || 'loadtest-only';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'test-password';
const MAX_DURATION = __ENV.BASELINE_MAX_DURATION || '20m';

const SUPPORTED_APIS = [
  'destination_search',
  'reverse_geocode',
  'parking_search',
  'parking_detail',
  'parking_viewport',
  'parking_viewport_detail',
  'admin_login',
  'admin_reviews',
];

const requestFailures = new Counter('baseline_request_failures');
const httpErrors = new Counter('baseline_http_errors');
const timeouts = new Counter('baseline_timeouts');
const contractFailures = new Counter('baseline_contract_failures');
const overFiveSeconds = new Counter('baseline_over_5s');
const measuredRequests = new Counter('baseline_measured_requests');
const endpointDuration = new Trend('baseline_endpoint_duration');
const successRate = new Rate('baseline_success_rate');

const originMatch = /^(https?):\/\/([^/?#]+)$/i.exec(BASE_URL);
if (__ENV.LOADTEST_ENV !== 'local') {
  throw new Error('LOADTEST_ENV=local인 격리된 로컬 환경에서만 실행할 수 있습니다.');
}
if (!originMatch || originMatch[2].includes('@')) {
  throw new Error('LOADTEST_BASE_URL에는 인증 정보나 경로가 없는 로컬 origin을 지정하세요.');
}
const hostname = originMatch[2].replace(/:\d+$/, '').toLowerCase();
if (!['localhost', '127.0.0.1', 'nginx'].includes(hostname)) {
  throw new Error('부하 대상은 localhost, 127.0.0.1 또는 loadtest Compose의 nginx여야 합니다.');
}
if (!SUPPORTED_APIS.includes(API_NAME)) {
  throw new Error(`API_NAME은 다음 중 하나여야 합니다: ${SUPPORTED_APIS.join(', ')}`);
}
if (!['warmup', 'measure'].includes(MODE)) {
  throw new Error('BASELINE_MODE는 warmup 또는 measure여야 합니다.');
}
if (!Number.isInteger(ITERATIONS) || ITERATIONS < 1 || ITERATIONS > 1000) {
  throw new Error('BASELINE_ITERATIONS는 1~1000의 정수여야 합니다.');
}
if (!Number.isFinite(THINK_TIME_SECONDS) || THINK_TIME_SECONDS < 1 || THINK_TIME_SECONDS > 30) {
  throw new Error('THINK_TIME_SECONDS는 1~30초로 지정하세요.');
}
if (!Number.isInteger(PARKING_LOT_ID) || PARKING_LOT_ID < 1) {
  throw new Error('PARKING_LOT_ID는 양의 정수여야 합니다.');
}
if (!Number.isFinite(LATITUDE) || LATITUDE < -90 || LATITUDE > 90
    || !Number.isFinite(LONGITUDE) || LONGITUDE < -180 || LONGITUDE > 180) {
  throw new Error('목적지 좌표 범위를 확인하세요.');
}
if (API_NAME === 'parking_search' || API_NAME === 'parking_detail') {
  const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:(00|10|20|30|40|50):00\+09:00$/;
  if (!datePattern.test(ENTRY_AT) || !datePattern.test(EXIT_AT)
      || Date.parse(ENTRY_AT) <= Date.now() || Date.parse(EXIT_AT) <= Date.parse(ENTRY_AT)) {
    throw new Error('ENTRY_AT과 EXIT_AT은 미래의 10분 단위 서울 시각으로 지정하세요.');
  }
}

export const options = {
  discardResponseBodies: false,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],
  scenarios: {
    api_baseline: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: MODE === 'warmup' ? Math.min(10, ITERATIONS) : ITERATIONS,
      maxDuration: MAX_DURATION,
      gracefulStop: '15s',
    },
  },
  thresholds: {
    baseline_request_failures: ['count==0'],
    baseline_contract_failures: ['count==0'],
    baseline_success_rate: ['rate==1'],
  },
};

export function setup() {
  if (API_NAME !== 'admin_reviews') {
    return {};
  }

  const response = http.post(
    `${BASE_URL}/api/admin/auth/login`,
    JSON.stringify({ loginId: ADMIN_LOGIN_ID, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, timeout: '10s' },
  );

  let accessToken = '';
  try {
    accessToken = response.json('accessToken') || '';
  } catch (_) {
    accessToken = '';
  }
  if (response.status !== 200 || !accessToken) {
    throw new Error(`관리자 리뷰 API 준비용 로컬 로그인에 실패했습니다: HTTP ${response.status}`);
  }
  return { accessToken };
}

export default function (setupData) {
  const request = requestFor(API_NAME, setupData);
  const response = request();
  const validContract = validateResponse(API_NAME, response);
  const succeeded = response.status === 200 && validContract;
  const durationMs = Number(response.timings?.duration);
  const isTimeout = response.status === 0 && /timeout/i.test(response.error || '');
  const isHttpError = response.status !== 200;

  measuredRequests.add(1, { endpoint: API_NAME });
  endpointDuration.add(durationMs, { endpoint: API_NAME });
  successRate.add(succeeded, { endpoint: API_NAME });
  if (!succeeded) {
    requestFailures.add(1, { endpoint: API_NAME });
  }
  httpErrors.add(isHttpError ? 1 : 0, { endpoint: API_NAME });
  timeouts.add(isTimeout ? 1 : 0, { endpoint: API_NAME });
  if (response.status === 200 && !validContract) {
    contractFailures.add(1, { endpoint: API_NAME });
  }
  if (Number.isFinite(durationMs) && durationMs > 5000) {
    overFiveSeconds.add(1, { endpoint: API_NAME });
  }

  check(response, {
    'HTTP 200': (result) => result.status === 200,
    '응답 계약에 맞는 실제 결과': () => validContract,
  }, { endpoint: API_NAME });

  sleep(THINK_TIME_SECONDS);
}

function requestFor(apiName, setupData) {
  if (apiName === 'destination_search') {
    return () => http.get(`${BASE_URL}/api/destinations/search?query=%EA%B0%95%EB%82%A8%EC%97%AD`, optionsFor(apiName));
  }
  if (apiName === 'reverse_geocode') {
    return () => http.get(
      `${BASE_URL}/api/destinations/reverse-geocode?latitude=${LATITUDE}&longitude=${LONGITUDE}`,
      optionsFor(apiName),
    );
  }
  if (apiName === 'parking_search' || apiName === 'parking_detail') {
    const query = `destinationLatitude=${LATITUDE}&destinationLongitude=${LONGITUDE}`
      + `&entryAt=${encodeURIComponent(ENTRY_AT)}&exitAt=${encodeURIComponent(EXIT_AT)}`;
    const path = apiName === 'parking_search'
      ? `/api/parking/search?${query}`
      : `/api/parking/${PARKING_LOT_ID}?${query}`;
    return () => http.get(`${BASE_URL}${path}`, optionsFor(apiName));
  }
  if (apiName === 'parking_viewport') {
    const query = `westLongitude=${WEST_LONGITUDE}&southLatitude=${SOUTH_LATITUDE}`
      + `&eastLongitude=${EAST_LONGITUDE}&northLatitude=${NORTH_LATITUDE}`;
    return () => http.get(`${BASE_URL}/api/parking/viewport?${query}`, optionsFor(apiName));
  }
  if (apiName === 'parking_viewport_detail') {
    return () => http.get(
      `${BASE_URL}/api/parking/viewport/${PARKING_LOT_ID}`,
      optionsFor(apiName),
    );
  }
  if (apiName === 'admin_login') {
    return () => http.post(
      `${BASE_URL}/api/admin/auth/login`,
      JSON.stringify({ loginId: ADMIN_LOGIN_ID, password: ADMIN_PASSWORD }),
      { ...optionsFor(apiName), headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (apiName === 'admin_reviews') {
    return () => http.get(`${BASE_URL}/api/admin/parking/review`, {
      ...optionsFor(apiName),
      headers: { Authorization: `Bearer ${setupData.accessToken}` },
    });
  }
  throw new Error(`지원하지 않는 API: ${apiName}`);
}

function optionsFor(apiName) {
  return {
    redirects: 0,
    timeout: '60s',
    tags: { endpoint: apiName, name: requestName(apiName) },
  };
}

function requestName(apiName) {
  const names = {
    destination_search: 'GET /api/destinations/search',
    reverse_geocode: 'GET /api/destinations/reverse-geocode',
    parking_search: 'GET /api/parking/search',
    parking_detail: 'GET /api/parking/{parkingLotId}',
    parking_viewport: 'GET /api/parking/viewport',
    parking_viewport_detail: 'GET /api/parking/viewport/{parkingLotId}',
    admin_login: 'POST /api/admin/auth/login',
    admin_reviews: 'GET /api/admin/parking/review',
  };
  return names[apiName];
}

function validateResponse(apiName, response) {
  if (response.status !== 200) {
    return false;
  }
  let body;
  try {
    body = response.json();
  } catch (_) {
    return false;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }

  if (apiName === 'destination_search') {
    return body.query === '강남역' && Array.isArray(body.destinations)
      && body.destinations.length > 0 && typeof body.destinations[0].name === 'string';
  }
  if (apiName === 'reverse_geocode') {
    return typeof body.displayName === 'string' && body.displayName.length > 0;
  }
  if (apiName === 'parking_search') {
    return body.searchRadiusMeters === 600 && body.totalCount > 0
      && Array.isArray(body.parkingLots) && body.parkingLots.length > 0;
  }
  if (apiName === 'parking_detail') {
    return body.id === PARKING_LOT_ID && typeof body.name === 'string' && body.name.length > 0;
  }
  if (apiName === 'parking_viewport') {
    return Number.isInteger(body.totalCount) && body.totalCount > 0
      && Array.isArray(body.parkingLots) && body.totalCount === body.parkingLots.length;
  }
  if (apiName === 'parking_viewport_detail') {
    return body.id === PARKING_LOT_ID && typeof body.name === 'string'
      && Array.isArray(body.dailyOperations);
  }
  if (apiName === 'admin_login') {
    return typeof body.accessToken === 'string' && body.accessToken.length > 0
      && body.tokenType === 'Bearer';
  }
  if (apiName === 'admin_reviews') {
    return Array.isArray(body.reviews);
  }
  return false;
}
