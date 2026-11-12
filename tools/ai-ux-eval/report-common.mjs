import { lstat, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const nullableBoolean = (value) => (typeof value === 'boolean' ? value : null);
export const safeCount = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
export function commonRunFields(result) {
  return {
    modelClaim: nullableBoolean(result?.modelClaim),
    termination:
      typeof result?.termination === 'string' && /^[a-z_]+$/.test(result.termination)
        ? result.termination
        : 'execution_error',
    elapsedMs: Number.isFinite(result?.elapsedMs) ? result.elapsedMs : null,
  };
}

// 각 시나리오의 검증기가 증거를 확인한 결과만 공통 판정 형식으로 옮긴다.
export function commonIndependentFields(verified, unavailableReason = 'insufficient_evidence') {
  if (verified && ['passed', 'not_met', 'unavailable'].includes(verified.verification))
    return { verification: verified.verification, verificationReason: verified.verificationReason };
  return { verification: 'unavailable', verificationReason: unavailableReason };
}

// 별도 실행들은 같은 출력 경계를 쓰며, 각 보고서는 새 비공개 디렉터리에 저장한다.
export async function saveReportFiles({ root, prefix, report, markdown }) {
  if (!['fixture-', 'local-'].includes(prefix)) throw new Error('invalid_report_prefix');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const state = await lstat(root);
  if (!state.isDirectory() || state.isSymbolicLink()) throw new Error('invalid_report_directory');
  const output = await mkdtemp(path.join(root, prefix));
  await writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
  await writeFile(path.join(output, 'report.md'), markdown, { mode: 0o600, flag: 'wx' });
  return output;
}
