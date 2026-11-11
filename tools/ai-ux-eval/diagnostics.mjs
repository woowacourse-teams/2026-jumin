import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const fixtureHash = '12904bc2e5895bb38677e4e913ff3f61cbbfe50261549e916df4dfe0e12841b8';
const scenarioHashes = {
  'nearby-parking': 'd5ca326c341781442cdde08ca0ecea38ba734a926d5eac2240bd25e796048a08',
  'select-parking': 'b65de6302e8a0c0aca1c6deda63cf91c4b379b3c57e75c31596dd175df782421',
};
const personaHashes = {
  baseline: '9437c8a282d184315d3b1f6635ca8bb1175e17307a9ee04b0498002397096447',
  'first-time': '42f3beb3df67733358059e8b9260859c4ea48f76b8e4056f098ffa88332ef917',
  price: '753b9f64b417545a929846db95afdf54d349675b11bd99905ae8247233807848',
  walking: 'bb060bbb6abfa225f1536ba2c94da6e3e62ee6180548bf15e0d855b574477461',
};
const syntheticInputs = new Set(['', '가상역', '다른역']);
const hash = (value) => createHash('sha256').update(value).digest('hex');

function snapshotsIn(messages) {
  const snapshots = [];
  for (const message of messages) {
    if (typeof message.content !== 'string') continue;
    const markers =
      message.role === 'user'
        ? ['\n\n현재 화면:\n']
        : message.role === 'tool'
          ? [' 실행 성공. 현재 화면:\n', '\n\n현재 화면:\n']
          : [];
    const marker = markers.find((item) => message.content.includes(item));
    if (marker)
      snapshots.push({
        source: message.role === 'user' ? 'initial' : 'tool_result',
        text: message.content.slice(message.content.indexOf(marker) + marker.length),
      });
  }
  return snapshots;
}

export class Diagnostics {
  constructor(options, started, outputDirectory = path.join(directory, 'diagnostics')) {
    this.options = options;
    this.started = started;
    this.outputDirectory = outputDirectory;
    this.startedAt = new Date().toISOString();
    this.events = [];
    this.unknownInputs = new Set();
    this.approved = false;
    this.redactions = 0;
    this.runDirectory = null;
    this.fixtureOrigin = null;
  }

  async authorize(html) {
    const scenarioHash = hash(JSON.stringify(this.options.scenario));
    const personaHash = hash(JSON.stringify(this.options.persona));
    if (
      hash(html) !== fixtureHash ||
      scenarioHashes[this.options.scenario.id] !== scenarioHash ||
      personaHashes[this.options.persona.id] !== personaHash
    )
      throw new Error('진단 기록은 검토된 가상 화면과 시나리오·페르소나에서만 사용할 수 있습니다.');
    const files = [
      'agent.mjs',
      'evaluation.mjs',
      'diagnostics.mjs',
      'options.mjs',
      'scenario-verifier.mjs',
      'verifier-logic.mjs',
    ];
    const entries = await Promise.all(
      files.map(async (file) => [file, hash(await readFile(path.join(directory, file)))]),
    );
    this.configuration = {
      scenario: this.options.scenario.id,
      persona: this.options.persona.id,
      model: this.cleanString(this.options.model),
      maxActions: this.options.maxActions,
      maxConsecutiveErrors: this.options.maxConsecutiveErrors,
      timeoutMs: this.options.timeoutMs,
      modelOptions: this.clean(this.options.modelOptions),
      think: this.options.think,
      fixtureHash,
      scenarioHash,
      personaHash,
      codeHashes: Object.fromEntries(entries),
    };
    this.approved = true;
  }

  cleanString(value) {
    let text = String(value);
    for (const input of this.unknownInputs) {
      if (input.length >= 2 && text.includes(input)) {
        text = text.split(input).join('[임의 입력값 가림]');
        this.redactions += 1;
      }
    }
    for (const dir of [this.runDirectory, os.homedir(), os.tmpdir()].filter(Boolean)) {
      if (text.includes(dir)) {
        text = text.split(dir).join('[로컬 경로]');
        this.redactions += 1;
      }
    }
    const patterns = [
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      /\b(?:sk|pk|rk|ghp|gho|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/gi,
      /\bBearer\s+[^\s"']+/gi,
      /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)\s*[:=]\s*["']?[^\s,"']+/gi,
      /\b\d{6}[- ]?[1-4]\d{6}\b/g,
      /(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g,
    ];
    for (const pattern of patterns) {
      text = text.replace(pattern, () => {
        this.redactions += 1;
        return '[민감 정보 가림]';
      });
    }
    return text;
  }

  clean(value, key = '') {
    if (
      /^(thinking|reasoning|analysis|chain_of_thought|authorization|password|secret|api_key|access_token|refresh_token)$/i.test(
        key,
      )
    )
      return '[미기록]';
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return this.cleanString(value);
    if (Array.isArray(value)) return value.map((item) => this.clean(item));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([name, item]) => [
          this.cleanString(name),
          this.clean(item, name),
        ]),
      );
    return '[지원하지 않는 값]';
  }

  safeArgs(args) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return '[잘못된 인자]';
    const safe = {};
    for (const [key, value] of Object.entries(args)) {
      if (key === 'text' && typeof value === 'string' && !syntheticInputs.has(value)) {
        if (value.length >= 2) this.unknownInputs.add(value);
        safe[key] = '[가상 입력 외 값 가림]';
        this.redactions += 1;
      } else if (key === 'url' && typeof value === 'string') {
        try {
          const url = new URL(value);
          const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
          const fixture = url.origin === this.fixtureOrigin;
          const allowedPath = ['/', '/results'].includes(url.pathname);
          const approved =
            url.protocol === 'http:' &&
            fixture &&
            allowedPath &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash;
          safe[key] = approved ? url.href : '[가상 범위 외 주소 가림]';
          safe.urlMetadata = {
            scheme: ['http:', 'https:'].includes(url.protocol) ? url.protocol : 'other',
            origin: fixture ? 'fixture' : loopback ? 'other_loopback' : 'external',
            path: allowedPath ? url.pathname : 'other',
            hasCredentials: Boolean(url.username || url.password),
            hasQuery: Boolean(url.search),
            hasFragment: Boolean(url.hash),
          };
          if (!approved) this.redactions += 1;
        } catch {
          safe[key] = '[잘못된 주소 가림]';
          this.redactions += 1;
        }
      } else if (['target', 'element', 'text'].includes(key) && typeof value === 'string') {
        safe[key] = this.cleanString(value.slice(0, 240));
      } else if (key === 'success' && typeof value === 'boolean') {
        safe[key] = value;
      } else if (
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100_000)
      ) {
        safe[this.cleanString(key)] = value;
      } else if (
        typeof value === 'string' &&
        ['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'left', 'right', 'middle'].includes(
          value,
        )
      ) {
        safe[this.cleanString(key)] = value;
      } else {
        safe[this.cleanString(key)] = '[허용되지 않은 인자 값 미기록]';
        this.redactions += 1;
      }
    }
    return safe;
  }

  event(type, details = {}) {
    if (!this.approved) return;
    this.events.push(
      this.clean({ type, elapsedMs: Math.round(performance.now() - this.started), ...details }),
    );
  }

  modelRequest(turn, messages, tools = []) {
    const toolSchemas = tools.map((tool) => ({
      name: tool.function?.name,
      description: tool.function?.description,
      parameters: tool.function?.parameters,
    }));
    this.event('model_request', { turn, snapshots: snapshotsIn(messages), toolSchemas });
  }

  modelResponse(turn, response, durationMs) {
    const message = response?.message || {};
    const calls = Array.isArray(message.tool_calls)
      ? message.tool_calls.map((call, callIndex) => ({
          callIndex,
          name: this.cleanString(call?.function?.name || '[이름 없음]'),
          arguments: this.safeArgs(call?.function?.arguments),
        }))
      : [];
    const usage = {};
    for (const key of [
      'prompt_eval_count',
      'eval_count',
      'total_duration',
      'load_duration',
      'prompt_eval_duration',
      'eval_duration',
    ]) {
      if (typeof response?.[key] === 'number') usage[key] = response[key];
    }
    this.event('model_response', {
      turn,
      durationMs,
      doneReason: typeof response?.done_reason === 'string' ? response.done_reason : null,
      toolCalls: calls,
      visibleTextPresent: typeof message.content === 'string' && message.content.length > 0,
      visibleTextLength: typeof message.content === 'string' ? message.content.length : 0,
      internalReasoningRecorded: false,
      usage,
    });
  }

  async save(result) {
    if (!this.approved) return { status: 'refused' };
    await mkdir(this.outputDirectory, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.outputDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('진단 디렉터리를 확인해주세요.');
    const filename = `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`;
    const target = path.join(this.outputDirectory, filename);
    const record = {
      schemaVersion: 1,
      scope: 'reviewed-synthetic-fixture-only',
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      configuration: this.configuration,
      events: this.events,
      outcome: this.clean(result),
      redactions: this.redactions,
    };
    await writeFile(target, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { status: 'saved', file: target };
  }
}
