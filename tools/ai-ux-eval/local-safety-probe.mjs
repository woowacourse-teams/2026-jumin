import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import { installLocalSafety, localBrowserOptions, startSandboxWrapper } from './local-safety.mjs';

// 실제 주민 서버와 등록된 외부 앱에 닿지 않는 가상 출처로 보호 장치를 먼저 확인한다.
export async function probeLocalSafety({
  hostname = '127.0.0.1',
  upgradeInsecureRequests = false,
} = {}) {
  if (!['127.0.0.1', 'localhost'].includes(hostname))
    throw new Error('보호 시험에는 루프백 호스트만 사용할 수 있습니다.');
  const scheme = `juminprobe${randomBytes(10).toString('hex')}`;
  const hits = {
    viewport: 0,
    writes: 0,
    analytics: 0,
    otherApi: 0,
    webSockets: 0,
    redirectTarget: 0,
    methodOverrides: 0,
  };
  const redirectTarget = createServer((_request, response) => {
    hits.redirectTarget += 1;
    response.writeHead(200).end('unexpected');
  });
  const app = createServer((request, response) => {
    if (
      /^(?:www\.google-analytics\.com|www\.clarity\.ms|o1\.ingest\.sentry\.io):/.test(
        request.headers.host || '',
      )
    )
      hits.analytics += 1;
    if (request.method !== 'GET') hits.writes += 1;
    if (request.headers['x-http-method-override']) hits.methodOverrides += 1;
    if (request.url?.startsWith('/api/parking/viewport?')) {
      hits.viewport += 1;
      if (request.url.includes('freeOnly=true'))
        return response
          .writeHead(302, { location: `http://127.0.0.1:${redirectTarget.address().port}/blocked` })
          .end();
      return response
        .writeHead(200, { 'content-type': 'application/json' })
        .end('{"totalCount":0,"parkingLots":[]}');
    }
    if (request.url?.startsWith('/api/')) hits.otherApi += 1;
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return response.end(
        `<!doctype html><html><body><script>document.documentElement.dataset.before=localStorage.getItem('analytics_opt_out')||''</script><button onclick="location.assign('${scheme}://blocked')">외부 스킴 시험</button></body></html>`,
      );
    }
    response.writeHead(404).end();
  });
  app.on('upgrade', (_request, socket) => {
    hits.webSockets += 1;
    socket.destroy();
  });
  let wrapper;
  let browser;
  let context;
  try {
    await new Promise((resolve, reject) => {
      redirectTarget.once('error', reject);
      redirectTarget.listen(0, '127.0.0.1', resolve);
    });
    await new Promise((resolve, reject) => {
      app.once('error', reject);
      app.listen(0, '127.0.0.1', resolve);
    });
    const port = app.address().port;
    const appOrigin = `http://${hostname}:${port}`;
    wrapper = await startSandboxWrapper(appOrigin);
    browser = await chromium.launch({
      headless: true,
      channel: 'chromium',
      args: [
        '--no-proxy-server',
        '--host-resolver-rules=MAP www.google-analytics.com 127.0.0.1, MAP www.clarity.ms 127.0.0.1, MAP o1.ingest.sentry.io 127.0.0.1',
      ],
    });
    const contextOptions = { ...localBrowserOptions };
    delete contextOptions.headless;
    delete contextOptions.channel;
    context = await browser.newContext(contextOptions);
    const stats = await installLocalSafety(
      context,
      { appOrigin, wrapperOrigin: wrapper.origin },
      undefined,
      { upgradeInsecureRequests },
    );
    const page = await context.newPage();
    let protocolBlocked = false;
    let protocolProbeActive = false;
    page.on('console', (message) => {
      if (
        protocolProbeActive &&
        /navigation to external protocol blocked by sandbox|framing .*violates.*frame-src/i.test(
          message.text(),
        )
      )
        protocolBlocked = true;
    });
    await page.goto(wrapper.url, { waitUntil: 'load' });
    const frame = page.frames().find((item) => item.url() === `${appOrigin}/`);
    if (!frame) throw new Error('가상 보호 시험 프레임을 열지 못했습니다.');
    const firstScriptOptOut = await frame.evaluate(
      () => document.documentElement.dataset.before === 'true',
    );
    const cannotRemoveSandbox = await frame.evaluate(() => {
      try {
        window.parent.document.querySelector('iframe').removeAttribute('sandbox');
        return false;
      } catch {
        return true;
      }
    });
    const viewportQuery = 'southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128';
    const checks = await frame.evaluate(
      async ({ port: p, query }) => {
        const request = async (url, options) => {
          try {
            const response = await fetch(url, options);
            return response.ok;
          } catch {
            return false;
          }
        };
        const allowed = await request(`/api/parking/viewport?${query}`);
        const redirected = await request(`/api/parking/viewport?${query}&freeOnly=true`);
        const methodOverride = await request(`/api/parking/viewport?${query}`, {
          headers: { 'X-HTTP-Method-Override': 'POST' },
        });
        const report = await request('/api/reports', { method: 'POST', body: 'synthetic' });
        const like = await request('/api/parking/1/like', { method: 'POST', body: 'synthetic' });
        const analytics = await request(`http://www.google-analytics.com:${p}/collect`, {
          mode: 'no-cors',
        });
        const clarity = await request(`http://www.clarity.ms:${p}/collect`, { mode: 'no-cors' });
        const sentry = await request(`http://o1.ingest.sentry.io:${p}/envelope`, {
          mode: 'no-cors',
        });
        const otherApi = await request('/api/admin/parking/review');
        const registration = navigator.serviceWorker?.register('/service-worker.js').then(
          () => true,
          () => false,
        );
        if (registration)
          await Promise.race([registration, new Promise((resolve) => setTimeout(resolve, 500))]);
        const registrations = await navigator.serviceWorker
          ?.getRegistrations()
          .then((items) => items.length)
          .catch(() => -1);
        const controlled = Boolean(navigator.serviceWorker?.controller);
        await new Promise((resolve) => {
          const socket = new WebSocket(`ws://127.0.0.1:${p}/ws`);
          socket.onclose = socket.onerror = () => resolve();
          setTimeout(resolve, 500);
        });
        return {
          allowed,
          redirected,
          methodOverride,
          report,
          like,
          analytics,
          clarity,
          sentry,
          otherApi,
          registrations,
          controlled,
        };
      },
      { port, query: viewportQuery },
    );
    protocolProbeActive = true;
    await frame.getByRole('button', { name: '외부 스킴 시험' }).click();
    await page.waitForTimeout(250);
    protocolProbeActive = false;
    try {
      await page.goto('http://www.google-analytics.com:' + port + '/external', { timeout: 1_500 });
    } catch {
      /* 차단 예상 */
    }
    const safe =
      firstScriptOptOut &&
      cannotRemoveSandbox &&
      checks.allowed &&
      !checks.redirected &&
      !checks.methodOverride &&
      !checks.report &&
      !checks.like &&
      !checks.analytics &&
      !checks.clarity &&
      !checks.sentry &&
      !checks.otherApi &&
      checks.registrations === 0 &&
      !checks.controlled &&
      context.serviceWorkers().length === 0 &&
      hits.viewport === 2 &&
      hits.redirectTarget === 0 &&
      hits.methodOverrides === 0 &&
      hits.writes === 0 &&
      hits.analytics === 0 &&
      hits.otherApi === 0 &&
      hits.webSockets === 0 &&
      stats.blockedWrites >= 2 &&
      stats.blockedRedirects >= 1 &&
      stats.blockedMethodOverrides >= 1 &&
      stats.blockedOther >= 1 &&
      stats.analyticsAttempts >= 4 &&
      stats.blockedWebSockets >= 1 &&
      protocolBlocked;
    return {
      passed: safe,
      firstScriptOptOut,
      cannotRemoveSandbox,
      serviceWorkersBlocked: checks.registrations === 0 && !checks.controlled,
      allowedLookupReachedServer: hits.viewport === 2,
      blockedWritesReachedServer: hits.writes,
      redirectTargetRequestsReachedServer: hits.redirectTarget,
      redirectsBlocked: stats.blockedRedirects,
      methodOverridesReachedServer: hits.methodOverrides,
      methodOverridesBlocked: stats.blockedMethodOverrides,
      analyticsRequestsReachedServer: hits.analytics,
      otherApiRequestsReachedServer: hits.otherApi,
      webSocketsReachedServer: hits.webSockets,
      analyticsAttemptsBlocked: stats.analyticsAttempts,
      blockedWrites: stats.blockedWrites,
      webSocketsBlocked: stats.blockedWebSockets,
      externalProtocolBlocked: protocolBlocked,
    };
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (wrapper?.server.listening) await new Promise((resolve) => wrapper.server.close(resolve));
    if (app.listening) await new Promise((resolve) => app.close(resolve));
    if (redirectTarget.listening) await new Promise((resolve) => redirectTarget.close(resolve));
  }
}
