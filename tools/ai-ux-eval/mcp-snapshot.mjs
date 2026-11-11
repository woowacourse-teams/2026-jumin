import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { EvaluationError } from './agent.mjs';

// MCP 버전에 따라 스냅샷이 본문 대신 임시 파일 링크로 반환될 수 있다.
export async function readSnapshot(response, outputDirectory, signal) {
  const match = response.match(/\[Snapshot\]\(([^)\n]+)\)/);
  if (!match) {
    const inline = response.match(/### (?:Page )?Snapshot\s*\n([\s\S]+)/);
    if (inline?.[1]?.trim()) return inline[1].trim();
    throw new EvaluationError('environment_error', 'MCP 접근성 스냅샷을 읽을 수 없습니다.');
  }
  const root = await realpath(outputDirectory);
  const file = await realpath(path.resolve(match[1]));
  const relative = path.relative(root, file);
  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    path.extname(file) !== '.yml'
  ) {
    throw new EvaluationError('environment_error', 'MCP 스냅샷 경로가 실행 범위를 벗어났습니다.');
  }
  const snapshot = await readFile(file, 'utf8');
  signal?.throwIfAborted();
  if (!snapshot || snapshot.length > 100_000)
    throw new EvaluationError('environment_error', 'MCP 스냅샷 크기를 확인해주세요.');
  return snapshot;
}
