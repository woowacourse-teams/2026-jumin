import { options as parkingOptions, viewport, recommendation } from './parking-apis.js';

const profile = __ENV.LOAD_PROFILE || 'both';
const viewportP95Ms = Number(__ENV.VIEWPORT_P95_MS || '300');
const recommendationP95Ms = Number(__ENV.RECOMMENDATION_P95_MS || '2000');
const failureRateLimit = Number(__ENV.FAILURE_RATE_LIMIT || '0.01');

if (![viewportP95Ms, recommendationP95Ms].every(value => Number.isFinite(value) && value > 0)) {
  throw new Error('API별 p95 목표는 양수인 밀리초 값이어야 합니다.');
}
if (!Number.isFinite(failureRateLimit) || failureRateLimit <= 0 || failureRateLimit > 1) {
  throw new Error('FAILURE_RATE_LIMIT은 0 초과 1 이하의 값이어야 합니다.');
}

const thresholds = { dropped_iterations: ['count==0'] };
if (profile === 'viewport' || profile === 'both') {
  thresholds['http_req_duration{endpoint:viewport}'] = [`p(95)<${viewportP95Ms}`];
  thresholds.viewport_failure_rate = [`rate<${failureRateLimit}`];
}
if (profile === 'recommendation' || profile === 'both') {
  thresholds['http_req_duration{endpoint:recommendation}'] = [`p(95)<${recommendationP95Ms}`];
  thresholds.recommendation_failure_rate = [`rate<${failureRateLimit}`];
}

export const options = {
  ...parkingOptions,
  scenarios: Object.fromEntries(Object.entries(parkingOptions.scenarios).map(([name, scenario]) => [
    name,
    { ...scenario, gracefulStop: '65s' },
  ])),
  thresholds,
};

export { viewport, recommendation };
