import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { reservePort } from '../../evaluation.mjs';
import { runLocalSmoke } from '../../local-smoke.mjs';
import { parseOptions } from '../../options.mjs';
import { createLocalReport } from '../../local-report.mjs';

const call = (name, args) => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ function: { name, arguments: args } }],
});
test('가상 로컬 서버에서 실제 선택 실행 경로와 같은 세션 검증을 연결한다', async () => {
  let requests = [];
  let duration = 2;
  let destinationName = '가상 목적지';
  let destinationAddress = '서울특별시 용산구 한강대로 405';
  const model = createServer(async (req, res) => {
    if (req.url === '/api/tags')
      return res.end(JSON.stringify({ models: [{ name: 'qwen3.5:9b', digest: 'd'.repeat(64) }] }));
    if (req.url === '/api/ps') return res.end(JSON.stringify({ models: [] }));
    if (req.url === '/api/show')
      return res.end(
        JSON.stringify({
          capabilities: ['tools'],
          details: { runner: 'mock', quantization_level: 'Q4' },
        }),
      );
    if (req.url === '/api/chat') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      requests.push(data);
      const feedback = data.messages.filter((x) => x.role === 'tool');
      const n = requests.length - 1;
      if (n >= 6)
        return res.end(JSON.stringify({ message: call('report_completion', { success: true }) }));
      const snapshot = n
        ? feedback.at(-1).content
        : data.messages.find((x) => x.role === 'user').content;
      const names = [
        '목적지 검색',
        '목적지 검색',
        '가상 목적지 선택',
        '2시간',
        '추천 보기',
        '가상 주차장 길찾기',
      ];
      const line = snapshot.split('\n').find((x) => x.includes(names[n]) && x.includes('[ref='));
      const target = line?.match(/\[ref=([^\]]+)\]/)?.[1] || 'missing';
      const action =
        n === 1
          ? call('browser_type', { target, text: '가상 검색' })
          : call('browser_click', { target });
      return res.end(JSON.stringify({ message: action }));
    }
    res.writeHead(404).end();
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-parking-local-'));
  try {
    await new Promise((resolve) => model.listen(0, '127.0.0.1', resolve));
    const port = await reservePort(new AbortController().signal);
    const opts = parseOptions(
      [
        '--mode',
        'local',
        '--local-url',
        `http://127.0.0.1:${port}`,
        '--scenario',
        'local-select-parking',
        '--persona',
        'price',
        '--model',
        'qwen3.5:9b',
        '--ollama-url',
        `http://127.0.0.1:${model.address().port}`,
        '--timeout-seconds',
        '60',
      ],
      {},
    );
    const env = {
      ...process.env,
      NAVER_MAP_CLIENT_ID: 'synthetic-secret',
      API_PROXY_TARGET: 'http://127.0.0.1:12345',
    };
    const frontendLauncher = ({ port: p, env: childEnv, directory }) => {
      const script = `const h=require('node:http'),fs=require('node:fs');h.createServer((q,r)=>{if(q.method!=='GET'){fs.writeFileSync('unexpected-write','1');return r.writeHead(500).end()}if(q.url.startsWith('/api/parking/viewport?')){r.writeHead(200,{'content-type':'application/json'});return r.end('{"totalCount":0,"parkingLots":[]}')}if(q.url.startsWith('/api/')){r.writeHead(200,{'content-type':'application/json'});return r.end('{}')}r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(\`<!doctype html><main id="app"><input aria-label="목적지 검색" onclick="openSearch()" readonly></main><script>window.naver={maps:{Map:function(){}}};fetch('/api/parking/viewport?southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128');fetch('/api/parking/review',{method:'POST'}).catch(()=>{});function openSearch(){history.pushState({},'', '/search?lat=37&lng=127');document.getElementById('app').innerHTML='<input aria-label="목적지 검색" oninput="search()"><button onclick="selectDestination()">가상 목적지 선택</button>'}function search(){fetch('/api/destinations/search?query=test&latitude=37&longitude=127')}function selectDestination(){localStorage.setItem('recentSearches',JSON.stringify([{name:'${destinationName}',address:'${destinationAddress}',latitude:37,longitude:127}]));history.pushState({},'', '/parkingsetup?lat=37&lng=127&name=virtual');document.getElementById('app').innerHTML='<button onclick="chooseTime()">2시간</button><button onclick="recommend()">추천 보기</button>'}function chooseTime(){window.chosen=true}function recommend(){const name=encodeURIComponent('${destinationName}');const e=encodeURIComponent('2026-11-11T09:00:00+09:00');const x=encodeURIComponent('2026-11-11T${duration === 2 ? '11' : '10'}:00:00+09:00');history.pushState({},'', '/parkingRecommend?lat=37&lng=127&name='+name+'&entryAt='+e+'&exitAt='+x);fetch('/api/parking/search?destinationLatitude=37&destinationLongitude=127&entryAt='+e+'&exitAt='+x);document.getElementById('app').innerHTML='<section aria-label="주차장 전체 목록"><article><h3>가상 주차장</h3><strong>1,000원</strong><p>200m(3분)</p><button aria-label="가상 주차장 길찾기" onclick="directions()">길찾기</button></article><article><h3>두번째 주차장</h3><p><strong>2,000원</strong><span>100m(2분)</span></p></article></section>'}function directions(){document.body.insertAdjacentHTML('beforeend','<div role="dialog" aria-label="어떤 앱으로 갈까요?"><p>가상 주차장까지 안내합니다.</p></div>')}</script>\`)}).listen(${p},'127.0.0.1')`;
      return spawn(process.execPath, ['-e', script], {
        cwd: directory,
        env: childEnv,
        detached: true,
        stdio: 'ignore',
      });
    };
    // 모델 대역의 고정 행동으로 기존 2시간 계약과 별도 1시간 경로를 확인한다.
    for (const [hours, oneHour, address, expected] of [
      [2, false, '서울특별시 용산구 한강대로 405', 'passed'],
      [1, false, '서울특별시 용산구 한강대로 405', 'not_met'],
      [1, true, '서울특별시 용산구 한강대로 405', 'passed'],
      // 같은 도로명·건물번호라도 공급자의 자치구 표기가 다를 수 있다.
      [1, true, '서울특별시 중구 한강대로 405', 'passed'],
      [1, true, '', 'unavailable'],
      [1, true, '서울특별시 중구 한강대로 406', 'unavailable'],
    ]) {
      duration = hours;
      destinationName = oneHour ? '서울역' : '가상 목적지';
      destinationAddress = address;
      const runOptions = oneHour
        ? {
            ...opts,
            persona: { id: 'baseline', description: null },
            scenario: {
              id: 'local-one-hour-parking',
              goal: '서울역을 목적지로 검색하고, 현재 기본 주차 조건에서 주차장 하나를 선택하여 길찾기 앱 선택 화면을 여세요.',
            },
          }
        : opts;
      requests = [];
      const result = await runLocalSmoke(runOptions, {
        dataFingerprintKey: Buffer.alloc(32, 7),
        env,
        clientDirectory: root,
        frontendLauncher,
        tempRoot: root,
        capabilityCheck: async () => true,
      });
      assert.equal(result.modelClaim, true, JSON.stringify(result));
      assert.equal(result.verification, expected, JSON.stringify(result));
      assert.equal(
        result.parkingEvidence.duration,
        hours === 2 ? 'two_hours' : oneHour ? 'one_hour' : 'other',
      );
      assert.equal(result.parkingEvidence.searchSelection, true);
      assert.equal(
        result.dataFingerprint.core.complete,
        (oneHour && expected === 'passed') || (!oneHour && hours === 2),
      );
      if (oneHour) {
        assert.equal(result.parkingEvidence.destinationNameMatch, true);
        assert.equal(result.parkingEvidence.destinationNameKind, 'exact');
        assert.equal(result.parkingEvidence.destinationMatch, expected === 'passed' ? true : null);
        assert.equal(
          result.parkingEvidence.destinationAddressMatch,
          address ? expected === 'passed' : null,
        );
      }
      assert.equal(result.parkingEvidence.selectedParking, true);
      assert.deepEqual(result.parkingEvidence.candidateComparison, {
        scope: 'rendered_full_list',
        count: 2,
        selectedUnique: true,
        fee: { result: 'minimum', missing: 0, minimumTies: 1 },
        walking: { result: 'not_minimum', missing: 0, minimumTies: 1 },
      });
      assert.equal(result.parkingEvidence.directionsDialog, true);
      assert.equal(result.parkingEvidence.preference, 'unavailable');
      assert.equal(result.safety.blockedWrites, 1);
      const report = createLocalReport(result, { options: runOptions, source: 'local_run' });
      assert.equal(report.verification, expected);
      if (oneHour) {
        assert.equal(report.parkingEvidence.destinationNameKind, 'exact');
        assert.equal(
          report.actions.find((action) => action.tool === 'browser_type').taskInput,
          'different',
        );
      }
      assert.doesNotMatch(
        JSON.stringify(result) + JSON.stringify(report),
        /synthetic-secret|가상 목적지|가상 주차장|두번째 주차장|1,000원|2026-11-11T09:00:00|127\.0\.0\.1/,
      );
      assert.ok(requests[0].messages[1].content.includes(runOptions.scenario.goal));
      assert.doesNotMatch(requests[0].messages[1].content, /가상 주차장/);
      await assert.rejects(access(path.join(root, 'unexpected-write')), { code: 'ENOENT' });
      assert.deepEqual(result.cleanupErrors, []);
    }
  } finally {
    model.closeAllConnections();
    if (model.listening) await new Promise((resolve) => model.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
