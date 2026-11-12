import { createServer } from 'node:http';

const analyticsDomains = [
  'google-analytics.com',
  'googletagmanager.com',
  'clarity.ms',
  'sentry.io',
];
const devHosts = new Set(['dev.jucha.info', 'origin-dev.jucha.info']);
const geo = { latitude: 37.4981, longitude: 127.0279 };

const matchesDomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);
const validViewportResponse = (data) =>
  data !== null &&
  typeof data === 'object' &&
  Number.isFinite(data.totalCount) &&
  Array.isArray(data.parkingLots) &&
  data.parkingLots.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      ['id', 'latitude', 'longitude', 'score'].every((key) => Number.isFinite(item[key])),
  );
export const isAnalyticsHost = (host) =>
  analyticsDomains.some((domain) => matchesDomain(host, domain));
export const isMapHost = (host) =>
  host === 'oapi.map.naver.com' ||
  host === 'map.pstatic.net' ||
  host === 'ssl.pstatic.net' ||
  host.endsWith('.map.pstatic.net') ||
  host.endsWith('.map.naver.com') ||
  host.endsWith('.map.naver.net');

export function mapRequestKind(raw) {
  try {
    const url = new URL(raw);
    return url.hostname === 'oapi.map.naver.com' && url.pathname === '/openapi/v3/maps.js'
      ? 'sdk_script'
      : 'other_map_resource';
  } catch {
    return 'other_map_resource';
  }
}

export function classifyMapError(error) {
  const code = String(error?.code || error?.cause?.code || '');
  const message = String(error?.message || '');
  if (
    /^(ENOTFOUND|EAI_AGAIN|EAI_FAIL)$/.test(code) ||
    /\b(?:ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED)\b/.test(message)
  )
    return 'dns';
  if (
    /^(CERT_|ERR_TLS_|ERR_SSL_)/.test(code) ||
    [
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    ].includes(code) ||
    /\b(?:CERT_[A-Z_]+|ERR_CERT_[A-Z_]+|ERR_SSL_[A-Z_]+|ERR_TLS_[A-Z_]+)\b/.test(message)
  )
    return 'tls';
  if (
    error?.name === 'TimeoutError' ||
    code === 'ETIMEDOUT' ||
    /\bTimeout \d+ms exceeded\b/.test(message)
  )
    return 'timeout';
  return 'unknown';
}

export function allowedDevBackend(value) {
  try {
    const url = new URL(value);
    const local =
      url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && !!url.port;
    const dev = url.protocol === 'https:' && devHosts.has(url.hostname) && !url.port;
    if (
      (!local && !dev) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function safeDevEnvironment(env, backendOrigin) {
  const child = {
    ...env,
    API_PROXY_TARGET: backendOrigin,
    GA_MEASUREMENT_ID: '',
    CLARITY_PROJECT_ID: '',
    SENTRY_DSN: '',
    SENTRY_UPLOAD_SOURCEMAPS: 'false',
    pnpm_config_verify_deps_before_run: 'false',
  };
  for (const key of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) delete child[key];
  return child;
}

function safeQuery(url, required, optional = []) {
  if (url.search.length > 512) return false;
  const keys = [...url.searchParams.keys()];
  if (
    new Set(keys).size !== keys.length ||
    keys.some((key) => ![...required, ...optional].includes(key))
  )
    return false;
  if (required.some((key) => !url.searchParams.has(key))) return false;
  return keys.every((key) => {
    const value = url.searchParams.get(key);
    if (['freeOnly', 'excludeMechanical', 'isPublic'].includes(key))
      return value === 'true' || value === 'false';
    if (!/^-?\d{1,3}(?:\.\d{1,15})?$/.test(value)) return false;
    return Math.abs(Number(value)) <= (key.toLowerCase().includes('lat') ? 90 : 180);
  });
}

function selectionQuery(url, required, optional = []) {
  if (url.search.length > 1024) return false;
  const keys = [...url.searchParams.keys()];
  if (
    new Set(keys).size !== keys.length ||
    required.some((key) => !url.searchParams.has(key)) ||
    keys.some((key) => ![...required, ...optional].includes(key))
  )
    return false;
  return keys.every((key) => {
    const value = url.searchParams.get(key);
    if (['query', 'name'].includes(key))
      // 제어문자가 들어간 조회 문자열을 차단하는 보안 경계다.
      // eslint-disable-next-line no-control-regex
      return value.length >= 1 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
    if (['entryAt', 'exitAt'].includes(key))
      return (
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
          value,
        ) && Number.isFinite(Date.parse(value))
      );
    if (!/^-?\d{1,3}(?:\.\d{1,15})?$/.test(value)) return false;
    return Math.abs(Number(value)) <= (key.toLowerCase().includes('lat') ? 90 : 180);
  });
}

export function classifyLocalRequest(
  request,
  { appOrigin, wrapperOrigin, scenario = 'local-open-search' },
) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return { allow: false, reason: 'invalid_url' };
  }
  if (isAnalyticsHost(url.hostname)) return { allow: false, reason: 'analytics' };
  if (!['GET', 'HEAD'].includes(request.method)) return { allow: false, reason: 'write' };
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    return { allow: false, reason: 'external' };
  if (request.navigation) {
    if (request.topLevel)
      return url.origin === wrapperOrigin && url.pathname === '/' && !url.search && !url.hash
        ? { allow: true, reason: 'wrapper' }
        : { allow: false, reason: 'navigation' };
    const selection = ['local-select-parking', 'local-one-hour-parking'].includes(scenario);
    const safePath =
      url.pathname === '/'
        ? !url.search
        : url.pathname === '/search'
          ? safeQuery(url, [], ['lat', 'lng'])
          : selection && url.pathname === '/parkingsetup'
            ? selectionQuery(url, ['lat', 'lng'], ['name'])
            : selection && url.pathname === '/parkingRecommend'
              ? selectionQuery(url, ['lat', 'lng', 'name', 'entryAt', 'exitAt'])
              : false;
    return url.origin === appOrigin && !url.hash && safePath
      ? { allow: true, reason: 'app_navigation' }
      : { allow: false, reason: 'navigation' };
  }
  if (url.origin === wrapperOrigin && url.pathname === '/favicon.ico')
    return { allow: true, reason: 'wrapper' };
  if (url.origin === appOrigin) {
    if (url.pathname === '/api/parking/viewport') {
      const allowed =
        request.method === 'GET' &&
        safeQuery(
          url,
          ['southLatitude', 'westLongitude', 'northLatitude', 'eastLongitude'],
          ['freeOnly', 'excludeMechanical', 'isPublic'],
        );
      return { allow: allowed, reason: allowed ? 'viewport' : 'api' };
    }
    if (
      ['local-select-parking', 'local-one-hour-parking'].includes(scenario) &&
      request.method === 'GET'
    ) {
      const search =
        url.pathname === '/api/destinations/search' &&
        selectionQuery(url, ['query', 'latitude', 'longitude']);
      const reverse =
        url.pathname === '/api/destinations/reverse-geocode' &&
        selectionQuery(url, ['latitude', 'longitude']);
      const parking =
        (url.pathname === '/api/parking/search' ||
          /^\/api\/parking\/[1-9]\d{0,14}$/.test(url.pathname)) &&
        selectionQuery(url, ['destinationLatitude', 'destinationLongitude', 'entryAt', 'exitAt']);
      const detail = /^\/api\/parking\/viewport\/[1-9]\d{0,14}$/.test(url.pathname) && !url.search;
      if (search || reverse || parking || detail) return { allow: true, reason: 'selection_read' };
    }
    if (
      /^\/(?:assets|icons|splash|vendor)\/[A-Za-z0-9_./-]+$/.test(url.pathname) &&
      !url.pathname.includes('..') &&
      !url.pathname.includes('//')
    )
      return { allow: true, reason: 'app_asset' };
    if (url.pathname === '/manifest.webmanifest' || url.pathname === '/favicon.ico')
      return { allow: true, reason: 'app_asset' };
    return { allow: false, reason: 'api_or_unknown' };
  }
  if (
    url.protocol === 'https:' &&
    isMapHost(url.hostname) &&
    ['script', 'stylesheet', 'image', 'font', 'xhr', 'fetch', 'other'].includes(
      request.resourceType,
    )
  )
    return { allow: true, reason: 'map_resource' };
  return { allow: false, reason: 'external' };
}

export function redactLocalText(value, mapKey = '') {
  let text = String(value);
  if (mapKey) text = text.split(mapKey).join('[지도 키 가림]');
  return text
    .replace(/(ncpKeyId=)[^\s&"']+/gi, '$1[가림]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[개인정보 가림]')
    .replace(/(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g, '[개인정보 가림]')
    .replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g, '[개인정보 가림]')
    .replace(/\b(?:sk|pk|rk|ghp|gho|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/gi, '[비밀값 가림]')
    .replace(/\bBearer\s+[^\s"']+/gi, '[비밀값 가림]');
}

export function summarizeBlockedRequest(request, origins, reason) {
  let category = 'other';
  let fixedPath = 'other';
  let transport = 'other';
  try {
    const url = new URL(request.url);
    if (url.protocol === 'http:') transport = 'http';
    else if (url.protocol === 'https:') transport = 'https';
    if (isAnalyticsHost(url.hostname)) category = 'analytics';
    else if (isMapHost(url.hostname)) category = 'map';
    else if (url.origin === origins.appOrigin && url.pathname.startsWith('/api/'))
      category = 'dev_api';
    else if (url.origin === origins.appOrigin || url.origin === origins.wrapperOrigin)
      category = 'frontend';
    if (url.origin === origins.appOrigin && url.pathname === '/api/parking/viewport')
      fixedPath = '/api/parking/viewport';
    else if (url.origin === origins.appOrigin && url.pathname === '/') fixedPath = '/';
    else if (url.origin === origins.appOrigin && url.pathname === '/search') fixedPath = '/search';
  } catch {
    /* 원문을 보존하지 않는다. */
  }
  const method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(
    request.method,
  )
    ? request.method
    : 'other';
  const type = [
    'document',
    'stylesheet',
    'image',
    'media',
    'font',
    'script',
    'texttrack',
    'xhr',
    'fetch',
    'eventsource',
    'websocket',
    'manifest',
    'other',
  ].includes(request.resourceType)
    ? request.resourceType
    : 'other';
  return {
    method,
    category,
    path: fixedPath,
    resourceType: type,
    frame: request.navigation ? (request.topLevel ? 'top' : 'subframe') : 'none',
    transport,
    reason,
  };
}

export async function installLocalSafety(
  context,
  origins,
  onBlocked = () => {},
  { upgradeInsecureRequests = false, dataFingerprint = null } = {},
) {
  const stats = {
    analyticsAttempts: 0,
    blockedWrites: 0,
    blockedNavigations: 0,
    blockedRedirects: 0,
    blockedMethodOverrides: 0,
    blockedOther: 0,
    blockedWebSockets: 0,
    viewportOk: 0,
    viewportFailed: 0,
    mapResponses: 0,
    mapFailures: 0,
    mapResults: [],
  };
  const allowedRequests = new WeakSet();
  const reportedMapRequests = new WeakSet();
  const recordMapResult = (request, outcome, status = null) => {
    if (reportedMapRequests.has(request)) return;
    let url;
    try {
      url = new URL(request.url());
    } catch {
      return;
    }
    if (!isMapHost(url.hostname)) return;
    reportedMapRequests.add(request);
    const kind = mapRequestKind(request.url());
    const entry = stats.mapResults.find(
      (x) => x.kind === kind && x.outcome === outcome && x.status === status,
    );
    if (entry) entry.count += 1;
    else stats.mapResults.push({ kind, outcome, status, count: 1 });
    if (outcome === 'http' && status >= 200 && status < 300) stats.mapResponses += 1;
    else stats.mapFailures += 1;
  };
  await context.addInitScript(
    ({ origin }) => {
      if (location.origin === origin) {
        try {
          localStorage.setItem('analytics_opt_out', 'true');
        } catch {
          /* 검증기에서 실패로 구분한다. */
        }
      }
    },
    { origin: origins.appOrigin },
  );
  if (typeof context.routeWebSocket !== 'function')
    throw new Error('WebSocket 차단을 설정할 수 없습니다.');
  await context.routeWebSocket('**/*', (socket) => {
    stats.blockedWebSockets += 1;
    onBlocked({
      method: 'other',
      category: 'other',
      path: 'other',
      resourceType: 'websocket',
      frame: 'none',
      transport: 'other',
      reason: 'websocket',
    });
    socket.close({ code: 1008, reason: 'blocked' });
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    let topLevel = false;
    if (request.isNavigationRequest()) {
      try {
        topLevel = !request.frame().parentFrame();
      } catch {
        stats.blockedOther += 1;
        return route.abort('blockedbyclient');
      }
    }
    const decision = classifyLocalRequest(
      {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        navigation: request.isNavigationRequest(),
        topLevel,
      },
      origins,
    );
    if (
      ['viewport', 'selection_read'].includes(decision.reason) &&
      Object.keys(request.headers()).some((header) =>
        ['x-http-method', 'x-http-method-override', 'x-method-override'].includes(
          header.toLowerCase(),
        ),
      )
    ) {
      stats.blockedMethodOverrides += 1;
      onBlocked(
        summarizeBlockedRequest(
          {
            url: request.url(),
            method: request.method(),
            resourceType: request.resourceType(),
            navigation: request.isNavigationRequest(),
            topLevel,
          },
          origins,
          'method_override',
        ),
      );
      return route.abort('blockedbyclient');
    }
    if (decision.allow) {
      allowedRequests.add(request);
      // Playwright 라우팅은 최초 URL만 검사한다. 허용된 서버가 다른 URL로
      // 리디렉션해 정책을 우회하지 못하도록 응답을 직접 확인한다.
      try {
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
        if (response.status() >= 300 && response.status() < 400) {
          if (['viewport', 'selection_read', 'map_resource'].includes(decision.reason))
            dataFingerprint?.fail(
              decision.reason === 'map_resource' ? 'map_resource' : request.url(),
            );
          recordMapResult(request, 'policy_blocked', response.status());
          stats.blockedRedirects += 1;
          onBlocked(
            summarizeBlockedRequest(
              {
                url: request.url(),
                method: request.method(),
                resourceType: request.resourceType(),
                navigation: request.isNavigationRequest(),
                topLevel,
              },
              origins,
              'redirect',
            ),
          );
          return route.abort('blockedbyclient');
        }
        if (
          ['viewport', 'selection_read', 'map_resource'].includes(decision.reason) &&
          dataFingerprint
        ) {
          try {
            dataFingerprint.record({
              method: request.method(),
              url: request.url(),
              headers: await request.allHeaders(),
              status: response.status(),
              body: await response.body(),
              reason: decision.reason,
            });
          } catch {
            dataFingerprint.fail(
              decision.reason === 'map_resource' ? 'map_resource' : request.url(),
            );
          }
        }
        if (decision.reason === 'viewport') {
          let valid = false;
          try {
            valid = response.ok() && validViewportResponse(await response.json());
          } catch {
            // 응답 본문은 결과나 로그에 남기지 않는다.
          }
          if (valid) stats.viewportOk += 1;
          else stats.viewportFailed += 1;
        }
        if (upgradeInsecureRequests && decision.reason === 'app_navigation') {
          const headers = response.headers();
          headers['content-security-policy'] = headers['content-security-policy']
            ? `${headers['content-security-policy']}, upgrade-insecure-requests`
            : 'upgrade-insecure-requests';
          return route.fulfill({ response, headers });
        }
        return route.fulfill({ response });
      } catch (error) {
        if (['viewport', 'selection_read', 'map_resource'].includes(decision.reason))
          dataFingerprint?.fail(
            decision.reason === 'map_resource' ? 'map_resource' : request.url(),
          );
        recordMapResult(request, classifyMapError(error));
        return route.abort('failed').catch(() => {});
      }
    }
    if (decision.reason === 'analytics') stats.analyticsAttempts += 1;
    else if (decision.reason === 'write') stats.blockedWrites += 1;
    else if (decision.reason === 'navigation') stats.blockedNavigations += 1;
    else stats.blockedOther += 1;
    recordMapResult(request, 'policy_blocked');
    onBlocked(
      summarizeBlockedRequest(
        {
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
          navigation: request.isNavigationRequest(),
          topLevel,
        },
        origins,
        decision.reason,
      ),
    );
    return route.abort('blockedbyclient');
  });
  context.on('response', (response) => {
    try {
      if (!allowedRequests.has(response.request())) return;
      const url = new URL(response.url());
      if (isMapHost(url.hostname)) recordMapResult(response.request(), 'http', response.status());
    } catch {
      /* URL 원문을 기록하지 않는다. */
    }
  });
  context.on('requestfailed', (request) => {
    try {
      if (!allowedRequests.has(request)) return;
      const url = new URL(request.url());
      if (
        isMapHost(url.hostname) ||
        (url.origin === origins.appOrigin && url.pathname.startsWith('/api/'))
      )
        dataFingerprint?.fail(isMapHost(url.hostname) ? 'map_resource' : request.url());
      if (url.origin === origins.appOrigin && url.pathname === '/api/parking/viewport')
        stats.viewportFailed += 1;
      else if (isMapHost(url.hostname) && !request.isNavigationRequest())
        recordMapResult(request, 'unknown');
    } catch {
      /* URL 원문을 기록하지 않는다. */
    }
  });
  return stats;
}

export async function startSandboxWrapper(appOrigin) {
  const app = new URL(appOrigin);
  if (
    app.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(app.hostname) ||
    app.username ||
    app.password ||
    app.pathname !== '/' ||
    app.search ||
    app.hash
  )
    throw new Error('격리 대상은 로컬 프런트 origin이어야 합니다.');
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/') return response.writeHead(404).end();
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': `default-src 'none'; frame-src ${app.origin}; style-src 'unsafe-inline'`,
    });
    response.end(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{margin:0;border:0;width:100%;height:100%;overflow:hidden}</style></head><body><iframe title="주민 화면" sandbox="allow-scripts allow-same-origin allow-forms" allow="geolocation" src="${app.origin}/"></iframe></body></html>`,
    );
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  // 호스트는 같게 두고 포트를 분리해야 CDP 검증기가 격리된 프레임도
  // 관찰할 수 있다. 서로 다른 포트는 동일 출처 정책에서는 분리된다.
  const origin = `http://${app.hostname}:${server.address().port}`;
  if (origin === app.origin) {
    server.close();
    throw new Error('격리 출처가 겹칩니다.');
  }
  return { server, origin, url: `${origin}/` };
}

export const localBrowserOptions = {
  headless: true,
  channel: 'chromium',
  viewport: { width: 390, height: 844 },
  geolocation: geo,
  permissions: ['geolocation'],
  serviceWorkers: 'block',
  acceptDownloads: false,
};
