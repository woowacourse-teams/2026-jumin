import { parseOptions } from './options.mjs';
import { runEvaluation } from './evaluation.mjs';
import { runLocalSmoke } from './local-smoke.mjs';
import { EvaluationError } from './agent.mjs';
import { createLocalReport, saveLocalReport } from './local-report.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const usage = `사용법: pnpm eval --scenario select-parking --persona baseline --model qwen2.5:7b [옵션]

  --mode <이름>           fixture 또는 local (기본: fixture)
  --local-url <주소>      local 모드의 포트가 있는 루프백 프런트 주소
  --scenario <이름>       nearby-parking, select-parking, local-open-search, local-select-parking 또는 local-one-hour-parking
                          기본: fixture는 nearby-parking, local은 local-open-search
  --persona <이름>        baseline, first-time, price, walking (기본: baseline)
  --model <이름>          Ollama 로컬 모델 (기본: model-defaults.json)
  --ollama-url <주소>     루프백 Ollama 주소 (기본: http://127.0.0.1:11434)
  --max-actions <횟수>    브라우저 도구 요청 제한, 실패·스냅샷 포함 (기본: 10)
  --max-consecutive-errors <횟수>  연속 도구 오류 제한 (기본: 3)
  --timeout-seconds <초>  준비부터 독립 검증까지의 전체 제한 시간 (기본: 300)
  --num-predict <토큰>    모델 요청별 최대 출력 토큰 (기본: 256)
  --diagnostics           검토된 가상 화면의 진단 기록을 로컬에 저장
  --report                실제 스모크의 안전한 JSON·Markdown 보고서 저장
  --help                  사용법 출력`;

let options;
try {
  options = parseOptions(process.argv.slice(2));
} catch (error) {
  console.error(`입력 오류: ${error.message}`);
  process.exitCode = 2;
}

if (options?.help) {
  console.log(usage);
} else if (options) {
  const interrupt = new AbortController();
  const stop = () =>
    interrupt.abort(new EvaluationError('interrupted', '사용자가 실행을 중단했습니다.'));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('SIGHUP', stop);
  try {
    const run = options.mode === 'local' ? runLocalSmoke : runEvaluation;
    const result = await run(options, {
      signal: interrupt.signal,
      onDecision: (decision) => {
        console.error(
          `판단 ${decision.turn}: ${decision.tool}, 전달된 이전 도구 결과 ${decision.previousToolResults}개`,
        );
      },
    });
    if (options.report) {
      try {
        const report = createLocalReport(result, { options, source: 'local_run' });
        const output = await saveLocalReport(report);
        result.report = {
          status: 'saved',
          output: path.relative(path.dirname(fileURLToPath(import.meta.url)), output),
        };
      } catch {
        result.report = { status: 'failed' };
      }
    }
    console.log(JSON.stringify(result, null, 2));
    if (
      !['model_finished', 'model_stopped'].includes(result.termination) ||
      result.verification !== 'passed' ||
      result.cleanupErrors.length ||
      result.report?.status === 'failed' ||
      ['failed', 'refused'].includes(result.diagnostics?.status)
    ) {
      process.exitCode = 1;
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGHUP', stop);
  }
}
