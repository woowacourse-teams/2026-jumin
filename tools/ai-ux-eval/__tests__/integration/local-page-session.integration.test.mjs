import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';
import { mcpText, reservePort } from '../../evaluation.mjs';
import {
  installLocalSafety,
  localBrowserOptions,
  startSandboxWrapper,
} from '../../local-safety.mjs';
import {
  createReadOnlyMcpDirectory,
  localMcpArguments,
  readLocalSnapshot,
  verifyLocalSession,
} from '../../local-smoke.mjs';

const require = createRequire(import.meta.url);
test('직접 열기와 MCP 열기가 같은 보호된 탭·프레임과 독립 검증 세션을 본다', async () => {
  let writes = 0;
  const app = createServer((req, res) => {
    if (req.method !== 'GET') {
      writes++;
      return res.writeHead(500).end();
    }
    if (req.url.startsWith('/api/parking/viewport?'))
      return res.end('{"totalCount":0,"parkingLots":[]}');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      `<script>window.naver={maps:{Map:function(){}}}; localStorage.setItem('same-session','yes'); fetch('/api/parking/viewport?southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128');fetch('/api/reports',{method:'POST'}).catch(()=>{});function openSearch(){history.pushState({},'', '/search')}</script><input aria-label="목적지 검색" onclick="openSearch()">`,
    );
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-page-session-'));
  let wrapper, context, mcp;
  try {
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    const appOrigin = `http://127.0.0.1:${app.address().port}`;
    wrapper = await startSandboxWrapper(appOrigin);
    const port = await reservePort(new AbortController().signal);
    const endpoint = `http://127.0.0.1:${port}`;
    context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
      ...localBrowserOptions,
      args: ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`],
    });
    const safety = await installLocalSafety(
      context,
      { appOrigin, wrapperOrigin: wrapper.origin },
      () => {},
      { upgradeInsecureRequests: true },
    );
    const page = context.pages()[0];
    context.on('page', (extra) => {
      if (extra !== page) void extra.close().catch(() => {});
    });
    await page.goto(wrapper.url, { waitUntil: 'load' });
    const frameOf = () =>
      page
        .frames()
        .find((f) => f.parentFrame() === page.mainFrame() && f.url().startsWith(appOrigin));
    await page.waitForFunction(
      (origin) => [...document.querySelectorAll('iframe')].some((x) => x.src.startsWith(origin)),
      appOrigin,
    );
    const directFrame = frameOf();
    assert.ok(directFrame);
    assert.equal(await directFrame.evaluate(() => typeof window.naver?.maps?.Map), 'function');
    assert.equal(
      await directFrame.evaluate(() => localStorage.getItem('analytics_opt_out')),
      'true',
    );
    const output = path.join(root, 'out');
    await createReadOnlyMcpDirectory(output);
    const cli = path.join(path.dirname(require.resolve('@playwright/mcp/package.json')), 'cli.js');
    mcp = new Client({ name: 'local-page-test', version: '1' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: localMcpArguments(cli, endpoint, output),
      stderr: 'pipe',
    });
    transport.stderr?.resume();
    await mcp.connect(transport);
    const signal = new AbortController().signal;
    await mcpText(mcp, 'browser_navigate', { url: wrapper.url }, signal);
    assert.equal(context.pages().length, 1);
    assert.equal(context.pages()[0], page);
    const frame = frameOf();
    assert.ok(frame);
    assert.equal(await frame.evaluate(() => localStorage.getItem('same-session')), 'yes');
    assert.equal(await frame.evaluate(() => typeof window.naver?.maps?.Map), 'function');
    const snapshot = await readLocalSnapshot(mcp, output, signal);
    const line = snapshot
      .split('\n')
      .find((s) => s.includes('textbox') && s.includes('목적지 검색'));
    const ref = line?.match(/\[ref=([^\]]+)\]/)?.[1];
    assert.ok(ref, snapshot);
    await mcpText(mcp, 'browser_click', { target: ref, element: '검색 입력란' }, signal);
    assert.equal(await frame.evaluate(() => location.pathname), '/search');
    const verified = await verifyLocalSession(endpoint, wrapper.origin, appOrigin, signal);
    assert.equal(verified.verification, 'passed');
    assert.equal(verified.verificationReason, 'search_screen_observed');
    const missing = await verifyLocalSession(endpoint, 'http://127.0.0.1:1', appOrigin, signal);
    assert.equal(missing.verification, 'unavailable');
    assert.equal(missing.surveyDialogVisible, null);
    assert.equal(missing.searchInputVisible, null);
    assert.equal(missing.searchInputPresent, null);
    assert.ok(safety.blockedWrites >= 1);
    assert.equal(writes, 0);
  } finally {
    if (mcp) await mcp.close();
    if (context) await context.close();
    if (wrapper?.server.listening) {
      wrapper.server.closeAllConnections();
      await new Promise((resolve) => wrapper.server.close(resolve));
    }
    app.closeAllConnections();
    if (app.listening) await new Promise((resolve) => app.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
