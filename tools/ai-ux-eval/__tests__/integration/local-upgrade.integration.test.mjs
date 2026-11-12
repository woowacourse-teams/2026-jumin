import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright';
import {
  installLocalSafety,
  localBrowserOptions,
  startSandboxWrapper,
} from '../../local-safety.mjs';

// 앱 문서의 CSP만 바꾼 상태에서 로컬 조회와 외부 차단이 유지되는지 확인한다.
test('가상 앱 문서의 HTTP 리소스를 HTTPS로 바꾸고 조회만 허용한다', async () => {
  let writes = 0;
  let viewports = 0;
  let navigationHits = 0;
  const target = createServer((_req, res) => {
    navigationHits++;
    res.end();
  });
  const app = createServer((req, res) => {
    if (req.method !== 'GET') writes++;
    if (req.url.startsWith('/api/parking/viewport?')) {
      viewports++;
      if (req.url.includes('freeOnly=true'))
        return res.writeHead(302, { location: 'https://untrusted.invalid/redirect' }).end();
      return res
        .writeHead(200, { 'content-type': 'application/json' })
        .end('{"totalCount":0,"parkingLots":[]}');
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><script src="http://untrusted.invalid/resource.js"></script><script>
      const q='southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128';
      Promise.all([fetch('/api/parking/viewport?'+q).then(r=>r.ok),fetch('/api/parking/viewport?'+q+'&freeOnly=true').then(()=>false,()=>true),fetch('/api/reports',{method:'POST'}).then(()=>false,()=>true),fetch('http://www.google-analytics.com/probe',{mode:'no-cors'}).then(()=>false,()=>true)]).then(x=>document.body.dataset.result=JSON.stringify(x));
    </script><body><button onclick="location.href='http://127.0.0.1:${target.address().port}/navigate'">이동</button></body>`);
  });
  let wrapper, browser, context;
  try {
    await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.address().port}`;
    wrapper = await startSandboxWrapper(origin);
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const options = { ...localBrowserOptions };
    delete options.headless;
    delete options.channel;
    context = await browser.newContext(options);
    const blocked = [];
    const stats = await installLocalSafety(
      context,
      { appOrigin: origin, wrapperOrigin: wrapper.origin },
      (x) => blocked.push(x),
      { upgradeInsecureRequests: true },
    );
    const page = await context.newPage();
    await page.goto(wrapper.url, { waitUntil: 'load' });
    const frame = page.frames().find((f) => f.url() === `${origin}/`);
    assert.ok(frame);
    await frame.waitForFunction(() => Boolean(document.body.dataset.result));
    const results = await frame.evaluate(() => JSON.parse(document.body.dataset.result));
    assert.deepEqual(results, [true, true, true, true]);
    assert.ok(
      blocked.some(
        (x) => x.resourceType === 'script' && x.category === 'other' && x.transport === 'https',
      ),
    );
    assert.equal(stats.viewportOk, 1);
    assert.equal(stats.blockedRedirects, 1);
    assert.equal(writes, 0);
    assert.equal(viewports, 2);
    assert.ok(stats.blockedWrites >= 1);
    assert.ok(stats.analyticsAttempts >= 1);
    await frame.getByRole('button', { name: '이동' }).click();
    await page.waitForTimeout(250);
    assert.equal(navigationHits, 0);
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    if (wrapper?.server.listening) await new Promise((resolve) => wrapper.server.close(resolve));
    if (app.listening) {
      app.closeAllConnections();
      await new Promise((resolve) => app.close(resolve));
    }
    if (target.listening) {
      target.closeAllConnections();
      await new Promise((resolve) => target.close(resolve));
    }
  }
});
