import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const defaults = JSON.parse(
  readFileSync(new URL('./model-defaults.json', import.meta.url), 'utf8'),
);
const personas = JSON.parse(readFileSync(new URL('./personas.json', import.meta.url), 'utf8'));
const scenarios = {
  'nearby-parking': new URL('./scenarios/nearby-parking.json', import.meta.url),
  'select-parking': new URL('./scenarios/select-parking.json', import.meta.url),
  'local-open-search': new URL('./scenarios/local-open-search.json', import.meta.url),
  'local-select-parking': new URL('./scenarios/local-select-parking.json', import.meta.url),
  'local-one-hour-parking': new URL('./scenarios/local-one-hour-parking.json', import.meta.url),
};

function positiveInteger(value, name, maximum) {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error(`${name}은 1 이상 ${maximum} 이하여야 합니다.`);
  }
  return Number(value);
}

export function parseOptions(args, env = process.env) {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      strict: true,
      options: {
        mode: { type: 'string', default: 'fixture' },
        scenario: { type: 'string' },
        persona: { type: 'string', default: 'baseline' },
        model: { type: 'string' },
        'local-url': { type: 'string' },
        'ollama-url': { type: 'string', default: env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434' },
        'max-actions': { type: 'string', default: '10' },
        'max-consecutive-errors': { type: 'string', default: '3' },
        'timeout-seconds': { type: 'string', default: '300' },
        'num-predict': { type: 'string' },
        diagnostics: { type: 'boolean', default: false },
        report: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    }));
  } catch {
    throw new Error('CLI 옵션을 확인해주세요.');
  }
  if (values.help) return { help: true };
  if (!['fixture', 'local'].includes(values.mode)) throw new Error('실행 모드를 확인해주세요.');
  const scenarioName =
    values.scenario ?? (values.mode === 'local' ? 'local-open-search' : 'nearby-parking');
  if (!Object.hasOwn(scenarios, scenarioName))
    throw new Error('선택한 시나리오를 찾을 수 없습니다.');
  if ((values.mode === 'local') !== scenarioName.startsWith('local-'))
    throw new Error('시나리오와 실행 모드가 일치하지 않습니다.');
  if (!Object.hasOwn(personas, values.persona))
    throw new Error('선택한 페르소나를 찾을 수 없습니다.');
  if (
    values.mode === 'local' &&
    !(scenarioName === 'local-open-search'
      ? values.persona === 'baseline'
      : ['baseline', 'price', 'walking'].includes(values.persona))
  )
    throw new Error('해당 로컬 시나리오에서 지원하지 않는 페르소나입니다.');
  if (values.mode === 'local' && values.diagnostics)
    throw new Error('실제 화면에는 가상 화면 진단 기록을 사용할 수 없습니다.');
  if (values.mode !== 'local' && values.report)
    throw new Error('실제 화면 보고서는 local 모드에서만 지원합니다.');
  if (values.mode === 'local' && values.model !== 'qwen3.5:9b')
    throw new Error('로컬 스모크에는 --model qwen3.5:9b를 명시해야 합니다.');
  const model = values.model ?? (env.OLLAMA_MODEL || defaults.model);
  if (!/^[a-zA-Z0-9_./:-]{1,200}$/.test(model)) throw new Error('모델 이름을 확인해주세요.');

  let localUrl = null;
  if (values.mode === 'local') {
    try {
      const local = new URL(values['local-url']);
      if (
        local.protocol !== 'http:' ||
        !['127.0.0.1', 'localhost'].includes(local.hostname) ||
        local.username ||
        local.password ||
        local.pathname !== '/' ||
        local.search ||
        local.hash ||
        !local.port ||
        Number(local.port) < 1024
      )
        throw new Error('invalid');
      localUrl = local.href;
    } catch {
      throw new Error('로컬 화면 주소는 포트를 지정한 루프백 HTTP origin이어야 합니다.');
    }
  } else if (values['local-url']) {
    throw new Error('로컬 화면 주소는 local 모드에서만 사용할 수 있습니다.');
  }

  let url;
  try {
    url = new URL(values['ollama-url']);
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

  const scenario = JSON.parse(readFileSync(scenarios[scenarioName], 'utf8'));
  return {
    mode: values.mode,
    localUrl,
    scenario,
    persona: { id: values.persona, ...personas[values.persona] },
    model,
    modelOptions: {
      ...defaults.options,
      num_predict:
        values['num-predict'] === undefined
          ? defaults.options.num_predict
          : positiveInteger(values['num-predict'], '응답 토큰 제한', 4096),
    },
    think: defaults.think,
    ollamaOrigin: url.origin,
    maxActions: positiveInteger(values['max-actions'], '최대 행동 횟수', 100),
    maxConsecutiveErrors: positiveInteger(values['max-consecutive-errors'], '연속 오류 제한', 20),
    timeoutMs: positiveInteger(values['timeout-seconds'], '전체 제한 시간(초)', 3600) * 1000,
    diagnostics: values.diagnostics,
    report: values.report,
  };
}
