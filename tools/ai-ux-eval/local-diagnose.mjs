import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mcpText, reservePort } from './evaluation.mjs';
import {
  assertFreePort,
  createReadOnlyMcpDirectory,
  localMcpArguments,
  startOwnedFrontend,
  stopOwnedFrontend,
  waitForFrontend,
} from './local-smoke.mjs';
import {
  installLocalSafety,
  localBrowserOptions,
  safeDevEnvironment,
  startSandboxWrapper,
} from './local-safety.mjs';
import { probeLocalSafety } from './local-safety-probe.mjs';

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client');
const require = createRequire(import.meta.url);

// 초기 화면만 열고 차단된 요청의 허용 목록 기반 메타데이터만 집계한다.
export async function diagnoseLocal({
  env = process.env,
  directory = clientDir,
  frontendLauncher = startOwnedFrontend,
  port = 3000,
  timeoutMs = 60000,
  observationMs = 20000,
  mode = 'direct',
  hostname = '127.0.0.1',
  observeAuthFailure = false,
} = {}) {
  const counts = new Map();
  const result = {
    termination: 'environment_error',
    blocked: [],
    safety: null,
    analyticsOptOut: null,
    mapSdkAvailable: null,
    searchInputVisible: null,
    sdkScriptElementPresent: null,
    appRootHasContent: null,
    pageErrorCount: 0,
    authFailureObserved: null,
    fixedErrorScreenVisible: null,
    searchInputInDom: null,
    homeMainPresent: null,
    mapRegionPresent: null,
    routeLoadingVisible: null,
    surveyDialogVisible: null,
    searchInputAriaHidden: null,
    cleanupErrors: [],
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let child,
    wrapper,
    context,
    profile,
    mcp,
    exited = false;
  try {
    if (!['direct', 'mcp'].includes(mode)) throw new Error('invalid_mode');
    if (!['127.0.0.1', 'localhost'].includes(hostname)) throw new Error('invalid_hostname');
    let config = {};
    try {
      config = parseEnv(await readFile(path.join(directory, '.env'), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!String(env.NAVER_MAP_CLIENT_ID ?? config.NAVER_MAP_CLIENT_ID ?? '').trim())
      throw new Error('missing_key');
    const probe = await probeLocalSafety({ hostname, upgradeInsecureRequests: true });
    if (!probe.passed) throw new Error('safety_probe_failed');
    await assertFreePort(port);
    child = frontendLauncher({
      port,
      directory,
      env: safeDevEnvironment(env, 'https://dev.jucha.info'),
    });
    child.once('error', () => {
      exited = true;
    });
    child.once('exit', () => {
      exited = true;
    });
    const origin = `http://${hostname}:${port}`;
    await waitForFrontend(
      `http://127.0.0.1:${port}`,
      port,
      child.pid,
      controller.signal,
      () => exited,
    );
    wrapper = await startSandboxWrapper(origin);
    profile = await mkdtemp(path.join(os.tmpdir(), 'jumin-local-diagnostic-'));
    const cdpPort = mode === 'mcp' ? await reservePort(controller.signal) : null;
    context = await chromium.launchPersistentContext(path.join(profile, 'browser'), {
      ...localBrowserOptions,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      ...(cdpPort
        ? { args: ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${cdpPort}`] }
        : {}),
    });
    if (observeAuthFailure) {
      await context.addInitScript(() => {
        let assigned;
        let called = false;
        const observed = function (...args) {
          called = true;
          if (typeof assigned === 'function') return assigned.apply(this, args);
        };
        Object.defineProperty(window, 'navermap_authFailure', {
          configurable: true,
          get: () => observed,
          set: (value) => {
            assigned = value;
          },
        });
        Object.defineProperty(window, '__juminAuthFailureObserved', { get: () => called });
      });
    }
    const safety = await installLocalSafety(
      context,
      { appOrigin: origin, wrapperOrigin: wrapper.origin },
      (entry) => {
        const key = JSON.stringify(entry);
        counts.set(key, (counts.get(key) || 0) + 1);
      },
      { upgradeInsecureRequests: true },
    );
    const page = context.pages()[0];
    page.on('pageerror', () => {
      result.pageErrorCount += 1;
    });
    context.on('page', (extra) => {
      if (extra !== page) void extra.close().catch(() => {});
    });
    if (mode === 'direct') {
      await page.goto(wrapper.url, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
    } else {
      const output = path.join(profile, 'mcp-output');
      await createReadOnlyMcpDirectory(output);
      const cli = path.join(
        path.dirname(require.resolve('@playwright/mcp/package.json')),
        'cli.js',
      );
      mcp = new Client({ name: 'jumin-model-free-diagnostic', version: '1' });
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: localMcpArguments(cli, `http://127.0.0.1:${cdpPort}`, output),
        stderr: 'pipe',
      });
      transport.stderr?.resume();
      await mcp.connect(transport, { signal: controller.signal });
      await mcpText(mcp, 'browser_navigate', { url: wrapper.url }, controller.signal);
    }
    let frame;
    const deadline = performance.now() + Math.min(observationMs, 20000);
    while (performance.now() < deadline) {
      controller.signal.throwIfAborted();
      frame = page.frames().find((f) => {
        try {
          return f.parentFrame() === page.mainFrame() && new URL(f.url()).origin === origin;
        } catch {
          return false;
        }
      });
      if (frame) {
        try {
          const flags = await frame.evaluate(() => ({
            optOut: localStorage.getItem('analytics_opt_out') === 'true',
            sdk: typeof window.naver?.maps?.Map === 'function',
            sdkScript: Boolean(document.querySelector('script[src*="/openapi/v3/maps.js"]')),
            rootContent: Boolean(document.querySelector('#root')?.childElementCount),
            authFailure: window.__juminAuthFailureObserved === true,
            searchInputInDom: Boolean(document.querySelector('input[aria-label="목적지 검색"]')),
            homeMainPresent: Boolean(document.querySelector('main')),
            mapRegionPresent: Boolean(document.querySelector('[role="region"][aria-label="지도"]')),
            searchInputAriaHidden: Boolean(
              document
                .querySelector('input[aria-label="목적지 검색"]')
                ?.closest('[aria-hidden="true"]'),
            ),
          }));
          result.analyticsOptOut = flags.optOut;
          result.mapSdkAvailable = flags.sdk;
          result.sdkScriptElementPresent = flags.sdkScript;
          result.appRootHasContent = flags.rootContent;
          result.authFailureObserved = observeAuthFailure ? flags.authFailure : null;
          result.searchInputInDom = flags.searchInputInDom;
          result.homeMainPresent = flags.homeMainPresent;
          result.mapRegionPresent = flags.mapRegionPresent;
          result.searchInputAriaHidden = flags.searchInputAriaHidden;
          result.searchInputVisible = await frame
            .getByRole('textbox', { name: '목적지 검색' })
            .isVisible();
          result.fixedErrorScreenVisible = await frame
            .getByText('페이지를 불러오지 못했어요.', { exact: true })
            .isVisible();
          result.routeLoadingVisible = await frame
            .getByRole('status', { name: '페이지를 불러오는 중' })
            .isVisible();
          result.surveyDialogVisible = await frame
            .getByRole('dialog', { name: '서비스 이용 경험 설문' })
            .isVisible();
          if (flags.sdk && result.searchInputVisible && safety.viewportOk > 0) break;
        } catch {
          /* 미확인 */
        }
      }
      await page.waitForTimeout(300);
    }
    controller.signal.throwIfAborted();
    result.safety = { ...safety, mapResults: safety.mapResults.map((entry) => ({ ...entry })) };
    result.termination = frame ? 'diagnosed' : 'initial_frame_unavailable';
  } catch (error) {
    result.termination = controller.signal.aborted
      ? 'timeout'
      : ['missing_key', 'safety_probe_failed'].includes(error.message)
        ? error.message
        : 'environment_error';
  } finally {
    clearTimeout(timer);
    if (mcp)
      try {
        await mcp.close();
      } catch {
        result.cleanupErrors.push('mcp');
      }
    if (context)
      try {
        await context.close();
      } catch {
        result.cleanupErrors.push('browser');
      }
    if (wrapper?.server.listening)
      try {
        wrapper.server.closeAllConnections();
        await new Promise((resolve) => wrapper.server.close(resolve));
      } catch {
        result.cleanupErrors.push('wrapper');
      }
    if (child)
      try {
        await stopOwnedFrontend(child, port);
      } catch {
        result.cleanupErrors.push('frontend');
      }
    if (profile)
      try {
        await rm(profile, { recursive: true, force: true });
      } catch {
        result.cleanupErrors.push('profile');
      }
    result.blocked = [...counts].map(([key, count]) => ({ ...JSON.parse(key), count }));
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await diagnoseLocal();
  console.log(JSON.stringify(result, null, 2));
  if (result.termination !== 'diagnosed' || result.cleanupErrors.length) process.exitCode = 1;
}
