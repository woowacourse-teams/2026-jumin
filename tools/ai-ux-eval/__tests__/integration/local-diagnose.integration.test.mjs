import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { diagnoseLocal } from '../../local-diagnose.mjs';
import { reservePort } from '../../evaluation.mjs';

// 모델과 실제 서비스 없이 진단의 차단 및 민감정보 비노출 계약을 확인한다.
test('차단 요청은 서버에 도달하지 않고 결과에는 허용된 메타데이터만 남는다', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-diagnostic-test-'));
  try {
    const port = await reservePort(new AbortController().signal);
    const frontendLauncher = ({ port: p, env, directory }) => {
      const code = `const h=require('node:http'),f=require('node:fs');h.createServer((req,res)=>{if(req.method!=='GET')f.writeFileSync('unexpected-write','x');res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<body><p id="marker" hidden>페이지를 불러오지 못했어요.</p><script>window.naver={maps:{Map:function(){}}};window.navermap_authFailure=()=>{document.getElementById("marker").hidden=false};setTimeout(()=>window.navermap_authFailure(),0);fetch("/api/reports?key=synthetic-secret",{method:"POST",body:"synthetic-private"}).catch(()=>{});</script>')}).listen(${p},'127.0.0.1')`;
      return spawn(process.execPath, ['-e', code], {
        cwd: directory,
        env,
        detached: true,
        stdio: 'ignore',
      });
    };
    for (const [mode, hostname] of [
      ['direct', '127.0.0.1'],
      ['mcp', '127.0.0.1'],
      ['direct', 'localhost'],
    ]) {
      const result = await diagnoseLocal({
        directory: root,
        port,
        frontendLauncher,
        observationMs: 1000,
        observeAuthFailure: true,
        mode,
        hostname,
        env: {
          ...process.env,
          NAVER_MAP_CLIENT_ID: 'synthetic-secret',
          OLLAMA_BASE_URL: 'http://127.0.0.1:1',
        },
      });
      assert.equal(result.termination, 'diagnosed');
      assert.equal(result.analyticsOptOut, true);
      assert.equal(result.authFailureObserved, true);
      assert.equal(result.fixedErrorScreenVisible, true);
      assert.equal(result.searchInputInDom, false);
      assert.equal(result.homeMainPresent, false);
      assert.equal(result.mapRegionPresent, false);
      assert.equal(result.searchInputAriaHidden, false);
      assert.equal(result.surveyDialogVisible, false);
      assert.ok(
        result.blocked.some(
          (x) =>
            x.method === 'POST' &&
            x.category === 'dev_api' &&
            x.path === 'other' &&
            x.transport === 'http',
        ),
      );
      assert.doesNotMatch(
        JSON.stringify(result),
        /synthetic-secret|synthetic-private|127\.0\.0\.1|\?key/,
      );
      await assert.rejects(access(path.join(root, 'unexpected-write')), { code: 'ENOENT' });
      assert.deepEqual(result.cleanupErrors, []);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
