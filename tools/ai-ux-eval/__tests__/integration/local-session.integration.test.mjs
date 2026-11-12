import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
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

// 가상 로컬 서버에서 MCP와 별도 검증기가 같은 격리 세션을 읽는 계약을 확인한다.
test('MCP가 프레임을 조작해 검색 화면을 열어도 쓰기 요청은 서버에 도달하지 않는다', async () => {
  let writes = 0;
  const app = createServer((request, response) => {
    if (request.method !== 'GET') writes += 1;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      `<!doctype html><script>console.error('synthetic-map-key');window.naver={maps:{Map:function(){}}};function openSearch(){history.pushState({},'', '/search?lat=37.4981&lng=127.0279');fetch('/api/reports',{method:'POST',body:'synthetic'}).catch(()=>{});}</script><input aria-label="목적지 검색" onclick="openSearch()">`,
    );
  });
  let wrapper;
  let context;
  let mcp;
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-local-test-'));
  try {
    await new Promise((resolve, reject) => {
      app.once('error', reject);
      app.listen(0, '127.0.0.1', resolve);
    });
    const appOrigin = `http://127.0.0.1:${app.address().port}`;
    wrapper = await startSandboxWrapper(appOrigin);
    const port = await reservePort(new AbortController().signal);
    const endpoint = `http://127.0.0.1:${port}`;
    const output = path.join(root, 'output');
    await createReadOnlyMcpDirectory(output);
    context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
      ...localBrowserOptions,
      args: ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`],
    });
    const safety = await installLocalSafety(context, { appOrigin, wrapperOrigin: wrapper.origin });
    const initialPage = context.pages()[0];
    context.on('page', (page) => {
      if (page !== initialPage) void page.close();
    });
    const cli = path.join(path.dirname(require.resolve('@playwright/mcp/package.json')), 'cli.js');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: localMcpArguments(cli, endpoint, output),
      stderr: 'pipe',
    });
    transport.stderr?.resume();
    mcp = new Client({ name: 'local-session-test', version: '0.1.0' });
    const signal = new AbortController().signal;
    await mcp.connect(transport, { signal });
    await mcpText(mcp, 'browser_navigate', { url: wrapper.url }, signal);
    const before = await verifyLocalSession(endpoint, wrapper.origin, appOrigin, signal);
    assert.equal(before.verification, 'not_met');
    assert.equal(before.analyticsOptOut, true);
    const snapshot = await readLocalSnapshot(mcp, output, signal);
    const line = snapshot
      .split('\n')
      .find((item) => item.includes('textbox') && item.includes('목적지 검색'));
    const ref = line?.match(/\[ref=([^\]]+)\]/)?.[1];
    assert.ok(ref, 'MCP 스냅샷에서 프레임의 검색 입력을 관찰해야 합니다.');
    await mcpText(mcp, 'browser_click', { target: ref }, signal);
    const after = await verifyLocalSession(endpoint, wrapper.origin, appOrigin, signal);
    assert.equal(after.verification, 'passed');
    assert.equal(after.verificationReason, 'search_screen_observed');
    assert.equal(after.analyticsOptOut, true);
    assert.equal(writes, 0);
    assert.equal(safety.blockedWrites, 1);
    // 접근성 스냅샷과 민감값을 흉내 낸 콘솔 메시지는 파일로 기록되지 않아야 한다.
    assert.deepEqual(await readdir(output), []);
  } finally {
    if (mcp) await mcp.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (wrapper?.server.listening) await new Promise((resolve) => wrapper.server.close(resolve));
    if (app.listening) await new Promise((resolve) => app.close(resolve));
    await rm(root, { recursive: true, force: true });
    await assert.rejects(readdir(root));
  }
});
