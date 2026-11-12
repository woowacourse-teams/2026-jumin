import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright';
import { createDataFingerprint } from '../../local-data-fingerprint.mjs';
import {
  installLocalSafety,
  localBrowserOptions,
  startSandboxWrapper,
} from '../../local-safety.mjs';

// 로컬 서버의 세 조회가 보호 경로를 통과하고 쓰기는 서버에 닿지 않는지 확인한다.
test('보호된 실제 브라우저 조회에서 원문 없이 지문을 만들고 쓰기는 차단한다', async () => {
  let writes = 0;
  const app = createServer((req, res) => {
    if (req.method !== 'GET') writes++;
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/api/parking/viewport?'))
      return res.end('{"totalCount":0,"parkingLots":[]}');
    if (req.url.startsWith('/api/')) return res.end('{"secret":"PRIVATE-DATA"}');
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><p>가상 화면</p>');
  });
  let wrapper, browser, context;
  try {
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    const appOrigin = `http://127.0.0.1:${app.address().port}`;
    wrapper = await startSandboxWrapper(appOrigin);
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext(localBrowserOptions);
    const tracker = createDataFingerprint(Buffer.alloc(32, 9), { expectedDurationMs: 3600000 });
    const safety = await installLocalSafety(
      context,
      { appOrigin, wrapperOrigin: wrapper.origin, scenario: 'local-one-hour-parking' },
      () => {},
      { dataFingerprint: tracker },
    );
    const page = await context.newPage();
    await page.goto(wrapper.url);
    const frame = page.frames().find((f) => f.parentFrame() && f.url().startsWith(appOrigin));
    assert.ok(frame);
    await frame.evaluate(async () => {
      for (const url of [
        '/api/parking/viewport?southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128',
        '/api/destinations/search?query=test&latitude=37&longitude=127',
        '/api/parking/search?destinationLatitude=37&destinationLongitude=127&entryAt=2026-11-11T09%3A00%3A00%2B09%3A00&exitAt=2026-11-11T10%3A00%3A00%2B09%3A00',
      ])
        await fetch(url);
      await fetch('/api/parking/review', { method: 'POST' }).catch(() => {});
    });
    tracker.bindVerifiedDestination('37', '127');
    const proof = tracker.finish();
    // 외부 지도 리소스를 제공하지 않은 대역이므로 전체 일치를 주장하지 않는다.
    assert.equal(proof.complete, false);
    assert.equal(proof.core.complete, true);
    assert.equal(proof.core.count, 1);
    assert.equal(proof.count, 3);
    assert.equal(safety.blockedWrites, 1);
    assert.equal(writes, 0);
    assert.doesNotMatch(JSON.stringify(proof), /PRIVATE-DATA|127\.0\.0\.1|entryAt/);
  } finally {
    await context?.close();
    await browser?.close();
    if (wrapper?.server.listening) await new Promise((resolve) => wrapper.server.close(resolve));
    if (app.listening) await new Promise((resolve) => app.close(resolve));
  }
});
