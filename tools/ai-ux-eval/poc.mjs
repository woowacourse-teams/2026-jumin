import { execFile } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';
import { readSnapshot } from './mcp-snapshot.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const checkBrowser = process.argv.includes('--check-browser');
const model = process.env.OLLAMA_MODEL || 'qwen3:4b';
const maxActions = 6;

function ollamaOrigin() {
  let url;
  try {
    url = new URL(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
  } catch {
    throw new Error('Ollama 주소를 해석할 수 없습니다.');
  }
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Ollama 주소는 인증 정보가 없는 로컬 HTTP origin이어야 합니다.');
  }
  return url.origin;
}

async function jsonRequest(url, options = {}, timeout = 10_000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`로컬 모델 요청 실패: HTTP ${response.status}`);
  return response.json();
}

async function checkModel(origin) {
  const { models = [] } = await jsonRequest(`${origin}/api/tags`);
  if (!models.some((entry) => entry.name === model)) {
    throw new Error(`로컬 모델을 찾을 수 없습니다: ${model}`);
  }
  const info = await jsonRequest(`${origin}/api/show`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  console.log(
    `모델: ${model}, 선언된 기능: ${(info.capabilities || []).join(', ') || '확인 불가'}`,
  );
}

async function serveFixture() {
  const html = await readFile(path.join(directory, 'fixture.html'));
  const server = createHttpServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'",
      'cache-control': 'no-store',
    });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function reservePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function verify(endpoint, fixtureUrl) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join(directory, 'verify.mjs'), endpoint, fixtureUrl],
    { timeout: 20_000 },
  );
  return JSON.parse(stdout).complete;
}

async function callMcp(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`MCP 도구 실행 실패: ${name}`);
  return (result.content || [])
    .filter((entry) => entry.type === 'text')
    .map((entry) => entry.text)
    .join('\n');
}

function ollamaTools(available) {
  const definitions = {
    browser_snapshot: { type: 'object', properties: {}, additionalProperties: false },
    browser_click: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '화면 스냅샷에서 확인한 대상의 ref' },
        element: { type: 'string', description: '클릭할 요소의 짧은 설명' },
      },
      required: ['target'],
      additionalProperties: false,
    },
  };
  return Object.entries(definitions).map(([name, parameters]) => {
    const tool = available.find((entry) => entry.name === name);
    if (!tool) throw new Error(`필요한 MCP 도구가 없습니다: ${name}`);
    return { type: 'function', function: { name, description: tool.description, parameters } };
  });
}

function safeToolCall(call) {
  const { name, arguments: args } = call.function || {};
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('모델이 잘못된 도구 인자를 반환했습니다.');
  }
  if (name === 'browser_snapshot' && Object.keys(args).length === 0) return { name, args };
  if (
    name === 'browser_click' &&
    Object.keys(args).every((key) => ['target', 'element'].includes(key)) &&
    typeof args.target === 'string' &&
    args.target.length <= 200 &&
    (args.element === undefined || (typeof args.element === 'string' && args.element.length <= 200))
  ) {
    return { name, args };
  }
  throw new Error('허용되지 않는 도구 또는 도구 인자입니다.');
}

async function runModel(origin, client, available, initialSnapshot, outputDirectory) {
  const messages = [
    {
      role: 'user',
      content:
        '당신은 처음 이용하는 사람입니다. 화면에 나온 주차장 중 목적지까지 도보 시간이 가장 짧은 곳을 선택하세요. 화면에 보이는 정보로 행동하고 완료하면 그만두세요.\n\n현재 화면:\n' +
        initialSnapshot,
    },
  ];
  const tools = ollamaTools(available);
  let count = 0;
  let clicks = 0;
  while (count < maxActions) {
    const response = await jsonRequest(
      `${origin}/api/chat`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          tools,
          stream: false,
          think: false,
          options: { temperature: 0, num_ctx: 8192 },
        }),
      },
      180_000,
    );
    const message = response.message;
    if (!message || !Array.isArray(message.tool_calls) || message.tool_calls.length === 0) break;
    messages.push(message);
    for (const call of message.tool_calls) {
      if (count >= maxActions) break;
      const { name, args } = safeToolCall(call);
      const response = await callMcp(client, name, args);
      const snapshotResponse =
        name === 'browser_snapshot' ? response : await callMcp(client, 'browser_snapshot', {});
      const snapshot = await readSnapshot(snapshotResponse, outputDirectory);
      const content = `${name} 실행 성공. 현재 화면:\n${snapshot}`;
      count += 1;
      if (name === 'browser_click') clicks += 1;
      console.log(`모델이 요청한 MCP 도구 ${count}: ${name}`);
      messages.push({ role: 'tool', tool_name: name, content });
    }
  }
  return { count, clicks };
}

async function main() {
  if (!/^[a-zA-Z0-9_./:-]{1,200}$/.test(model)) throw new Error('모델 이름을 확인해주세요.');
  const origin = checkBrowser ? null : ollamaOrigin();
  if (origin) await checkModel(origin);
  const { server, url } = await serveFixture();
  let runDirectory;
  let context;
  let client;
  try {
    runDirectory = await mkdtemp(path.join(os.tmpdir(), 'jumin-ai-ux-'));
    const profile = path.join(runDirectory, 'profile');
    const outputDirectory = path.join(runDirectory, 'mcp-output');
    await mkdir(outputDirectory);
    const port = await reservePort();
    const endpoint = `http://127.0.0.1:${port}`;
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      viewport: { width: 390, height: 844 },
      args: [`--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${port}`],
    });
    const mcpCli = path.join(
      path.dirname(require.resolve('@playwright/mcp/package.json')),
      'cli.js',
    );
    client = new Client({ name: 'jumin-ai-ux-poc', version: '0.1.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        mcpCli,
        `--cdp-endpoint=${endpoint}`,
        `--allowed-origins=${new URL(url).origin}`,
        `--output-dir=${outputDirectory}`,
        '--file-paths=absolute',
      ],
      stderr: 'pipe',
    });
    transport.stderr?.resume();
    await client.connect(transport);
    const available = (await client.listTools()).tools;
    await callMcp(client, 'browser_navigate', { url });
    const initialSnapshot = await readSnapshot(
      await callMcp(client, 'browser_snapshot', {}),
      outputDirectory,
    );
    const before = await verify(endpoint, url);
    console.log(`독립 검증기 사전 판정: ${before ? '완료' : '미완료'}`);
    if (before) throw new Error('초기 화면이 이미 완료 상태입니다.');

    if (checkBrowser) {
      await callMcp(client, 'browser_click', { target: 'button:has-text("가람 주차장 선택")' });
      const wrongChoice = await verify(endpoint, url);
      console.log(`다른 주차장 선택 후 독립 판정: ${wrongChoice ? '완료' : '미완료'}`);
      if (wrongChoice) throw new Error('독립 검증기가 잘못된 선택을 완료로 판정했습니다.');
      await callMcp(client, 'browser_click', { target: 'button:has-text("다온 주차장 선택")' });
      console.log('수동 시나리오 MCP 클릭: browser_click 2회');
    } else {
      const { count, clicks } = await runModel(
        origin,
        client,
        available,
        initialSnapshot,
        outputDirectory,
      );
      console.log(`모델 요청 도구 호출: ${count}회, 클릭: ${clicks}회`);
      if (clicks === 0) throw new Error('모델이 브라우저 클릭을 요청하지 않았습니다.');
    }

    const after = await verify(endpoint, url);
    console.log(`독립 검증기 최종 판정: ${after ? '완료' : '미완료'}`);
    if (!after) throw new Error('독립 검증에서 목표를 확인하지 못했습니다.');
  } finally {
    if (client) await client.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (runDirectory) await rm(runDirectory, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  const message =
    error instanceof TypeError && error.message === 'fetch failed'
      ? '로컬 Ollama 서버 요청을 완료할 수 없습니다. 서버 실행 상태를 확인해주세요.'
      : error.message;
  console.error(`PoC 실패: ${message}`);
  process.exitCode = 1;
});
