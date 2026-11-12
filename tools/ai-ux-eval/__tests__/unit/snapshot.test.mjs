import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readSnapshot } from '../../mcp-snapshot.mjs';

// MCP의 파일 링크는 실제 스냅샷으로 바꾸되 임시 출력 디렉터리 밖을 읽지 않는다.
test('임시 스냅샷 내용을 읽고 경로 이탈 및 심볼릭 링크 이탈을 거부한다', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-snapshot-test-'));
  try {
    const output = path.join(root, 'output');
    const inside = path.join(output, 'page.yml');
    const outside = path.join(root, 'outside.yml');
    const escape = path.join(output, 'escape.yml');
    await mkdir(output);
    await writeFile(inside, '- button "가상 버튼"');
    await writeFile(outside, '가상 외부 파일');
    await symlink(outside, escape);

    assert.equal(await readSnapshot(`[Snapshot](${inside})`, output), '- button "가상 버튼"');
    await assert.rejects(readSnapshot(`[Snapshot](${outside})`, output));
    await assert.rejects(readSnapshot(`[Snapshot](${escape})`, output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
