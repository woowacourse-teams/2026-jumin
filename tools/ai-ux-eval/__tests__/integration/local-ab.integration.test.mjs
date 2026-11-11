import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { compareLocalVersions, markdownLocalAb, saveLocalAb } from '../../local-ab.mjs';
import { parseOptions } from '../../options.mjs';
import { createDataFingerprint } from '../../local-data-fingerprint.mjs';
import { classifyParkingEvidence } from '../../local-parking-logic.mjs';

// 모델 대역으로 두 실제 버전 연결의 호출 순서, 중단 조건과 결과 보호를 검증한다.
test('두 버전과 세 조건을 분리 실행하고 데이터 동일성은 미확인으로 둔다', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ab-local-'));
  try {
    const versions = [];
    for (const id of ['A', 'B']) {
      const dir = path.join(root, id);
      await mkdir(path.join(dir, 'src'), { recursive: true });
      await mkdir(path.join(dir, 'node_modules'));
      await writeFile(path.join(dir, 'package.json'), '{}');
      await writeFile(path.join(dir, 'src', 'main.js'), `// ${id}`);
      versions.push({
        id,
        clientDirectory: dir,
        scenarioReady: true,
        changeReviewed: true,
        dataSourceReviewed: true,
      });
    }
    const options = parseOptions(
      [
        '--mode',
        'local',
        '--local-url',
        'http://localhost:3000',
        '--scenario',
        'local-one-hour-parking',
        '--model',
        'qwen3.5:9b',
        '--num-predict',
        '1024',
      ],
      {},
    );
    const calls = [];
    const run = async (selected, { clientDirectory }) => {
      calls.push([selected.persona.id, clientDirectory]);
      return {
        mode: 'local',
        scenario: selected.scenario.id,
        persona: selected.persona.id,
        model: selected.model,
        interactionPolicy: 'modal-focus-v3',
        modelInfo: { digest: 'a'.repeat(64), runner: 'mlx', quantization: 'nvfp4' },
        modelClaim: true,
        verification: 'unavailable',
        verificationReason: 'not_verified',
        termination: 'model_finished',
        cleanupErrors: [],
        safety: { mapResults: [{ kind: 'sdk_script', outcome: 'http', status: 200, count: 1 }] },
        snapshot: 'PRIVATE-SNAPSHOT',
        modelSettings: selected.modelOptions,
        modelCalls: [
          {
            request: 1,
            inputTokens: 100,
            outputTokens: 10,
            doneReason: 'stop',
            responseKind: 'tool',
            elapsedMs: 1,
            contextObservation: 'reported_within_limit',
          },
        ],
        limits: {
          maxActions: selected.maxActions,
          maxConsecutiveErrors: selected.maxConsecutiveErrors,
          actionTimeoutMs: 5000,
          totalTimeoutMs: selected.timeoutMs,
        },
      };
    };
    const report = await compareLocalVersions(options, { versions, run });
    assert.equal(report.complete, true);
    assert.equal(report.runs.length, 6);
    assert.deepEqual(
      calls.map((c) => c[0]),
      ['baseline', 'price', 'walking', 'baseline', 'price', 'walking'],
    );
    assert.equal(new Set(calls.map((c) => c[1])).size, 2);
    // 승인된 교차 순서도 각 조건을 한 번씩 실행하고 저장 후 실제 순서가 보존된다.
    const executionOrder = [
      'A:baseline',
      'B:baseline',
      'B:price',
      'A:price',
      'A:walking',
      'B:walking',
    ];
    calls.length = 0;
    versions.forEach((v) => {
      v.humanReview = 'approved_scope_and_limits';
      v.commit = (v.id === 'A' ? 'a' : 'b').repeat(40);
    });
    const interleaved = await compareLocalVersions(options, { versions, run, executionOrder });
    assert.deepEqual(
      calls.map(([p, dir]) => `${path.basename(dir)}:${p}`),
      executionOrder,
    );
    const savedOrder = await saveLocalAb(interleaved, path.join(root, 'order-reports'));
    const orderReport = JSON.parse(await readFile(path.join(savedOrder, 'result.json'), 'utf8'));
    assert.deepEqual(orderReport.actualOrder, executionOrder);
    assert.deepEqual(orderReport.plannedOrder, executionOrder);
    assert.equal(orderReport.runs[0].sourceCommit, 'a'.repeat(40));
    assert.equal(
      orderReport.runs[0].versionReview.approvalBasis,
      'user_approved_preparation_and_limits',
    );
    assert.equal(orderReport.runs[0].versionReview.humanExecutionClaimed, false);
    // 누락·중복 순서는 브라우저/모델을 시작하기 전에 거부한다.
    calls.length = 0;
    await assert.rejects(
      compareLocalVersions(options, { versions, run, executionOrder: Array(6).fill('A:baseline') }),
    );
    assert.equal(calls.length, 0);

    assert.equal(report.comparability, 'unavailable');
    assert.doesNotMatch(
      JSON.stringify(report) + markdownLocalAb(report),
      /PRIVATE-SNAPSHOT|ab-local-/,
    );
    assert.equal(report.runs[0].result.modelClaim, true);
    assert.equal(report.runs[0].result.verification, 'unavailable');
    // 실제 응답 대신 합성 조회를 제공해 여섯 번 전체 일치와 일부 차이를 구분한다.
    let changedData = false;
    let observedFingerprint;
    let observedCoreRequest;
    let observedCoreResponse;
    let failBaselineA = false;
    let differentHeaders = false;
    let responseDiff = false;
    let mapError = false;
    let contextOver = false;
    const proofRun = async (selected, { dataFingerprintKey, clientDirectory }) => {
      const isA = path.basename(clientDirectory) === 'A';
      const proof = createDataFingerprint(dataFingerprintKey, { expectedDurationMs: 3600000 });
      for (const url of [
        '/api/parking/viewport?southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128',
        '/api/destinations/search?query=test&latitude=37&longitude=127',
        '/api/parking/search?destinationLatitude=37&destinationLongitude=127&entryAt=2026-11-11T09%3A00%3A00%2B09%3A00&exitAt=2026-11-11T10%3A00%3A00%2B09%3A00',
      ])
        proof.record({
          method: 'GET',
          url: `http://localhost:3000${url}`,
          headers: differentHeaders ? { 'x-session': isA ? 'a' : 'b' } : {},
          status: 200,
          body: Buffer.from(
            (changedData && selected.persona.id === 'walking') ||
              (responseDiff &&
                isA &&
                selected.persona.id === 'baseline' &&
                url.includes('/api/parking/search'))
              ? 'different'
              : 'PRIVATE-DATA',
          ),
        });
      proof.record({
        method: 'GET',
        url: 'https://map.pstatic.net/synthetic',
        headers: {},
        status: 200,
        body: Buffer.from('tile'),
        reason: 'map_resource',
      });
      proof.bindVerifiedDestination('37', '127');
      const dataFingerprint = proof.finish();
      observedFingerprint = dataFingerprint.digest;
      observedCoreRequest = dataFingerprint.core.request;
      observedCoreResponse = dataFingerprint.core.response;
      const parkingEvidence = classifyParkingEvidence(
        {
          recommendScreen: true,
          duration: 'one_hour',
          searchSelection: true,
          destinationMatch: true,
          destinationNameMatch: true,
          destinationAddressMatch: true,
          selectedParking: failBaselineA && isA && selected.persona.id === 'baseline' ? null : true,
          directionsDialog: !(failBaselineA && isA && selected.persona.id === 'baseline'),
        },
        'local-one-hour-parking',
      ).evidence;
      return {
        ...(await run(selected, { clientDirectory: 'test' })),
        ...(contextOver && isA
          ? {
              modelCalls: [
                {
                  request: 1,
                  inputTokens: 5000,
                  outputTokens: 10,
                  doneReason: 'stop',
                  responseKind: 'tool',
                  elapsedMs: 1,
                  contextObservation: 'reported_over_limit',
                },
              ],
            }
          : {}),
        contextPolicy: 'latest-screen-v1',
        verification:
          failBaselineA && isA && selected.persona.id === 'baseline' ? 'not_met' : 'passed',
        verificationReason:
          failBaselineA && isA && selected.persona.id === 'baseline'
            ? 'task_incomplete'
            : 'goal_observed',
        safety: {
          mapResults: [
            {
              kind: 'sdk_script',
              outcome: mapError && isA ? 'unknown' : 'http',
              status: mapError && isA ? null : 200,
              count: 1,
            },
          ],
        },
        parkingEvidence,
        dataFingerprint,
      };
    };
    const matched = await compareLocalVersions(options, {
      versions,
      run: proofRun,
      env: { API_PROXY_TARGET: 'https://dev.jucha.info' },
    });
    assert.equal(matched.dataSnapshot, 'unverified');
    assert.equal(matched.transactionSet, 'same_transactions');
    assert.equal(matched.comparability, 'comparable');
    const matchedOutput = await saveLocalAb(matched, path.join(root, 'matched-reports'));
    const matchedSaved = JSON.parse(
      await readFile(path.join(matchedOutput, 'result.json'), 'utf8'),
    );
    assert.equal(matchedSaved.comparability, 'comparable');
    assert.doesNotMatch(JSON.stringify(matched), /PRIVATE-DATA/);
    assert.ok(!JSON.stringify(matched).includes(observedFingerprint));
    assert.ok(!JSON.stringify(matched).includes(observedCoreRequest));
    assert.ok(!JSON.stringify(matched).includes(observedCoreResponse));
    changedData = true;
    // 기준·요금과 도보의 전체 조회가 다르면 일부 일치로 전체를 같다고 보지 않는다.
    const different = await compareLocalVersions(options, {
      versions,
      run: proofRun,
      env: { API_PROXY_TARGET: 'https://dev.jucha.info' },
    });
    assert.equal(different.dataSnapshot, 'unverified');
    assert.equal(different.transactionSet, 'transaction_difference');
    assert.equal(different.comparability, 'limited');
    changedData = false;
    failBaselineA = true;
    const mixed = await compareLocalVersions(options, {
      versions,
      run: proofRun,
      env: { API_PROXY_TARGET: 'https://dev.jucha.info' },
    });
    const baseline = mixed.pairs.find((p) => p.persona === 'baseline');
    assert.equal(baseline.runs.A.status, 'task_not_met');
    assert.equal(baseline.runs.B.status, 'task_completed');
    assert.equal(baseline.behaviorComparison, 'comparable');
    assert.equal(baseline.independentOutcomeComparison, 'comparable');
    assert.equal(baseline.coreParkingComparison, 'same_query_same_response');
    assert.equal(mixed.comparability, 'comparable');
    const mixedOutput = await saveLocalAb(mixed, path.join(root, 'mixed-reports'));
    const savedMixed = JSON.parse(await readFile(path.join(mixedOutput, 'result.json'), 'utf8'));
    assert.equal(savedMixed.pairs[0].behaviorComparison, 'comparable');
    assert.equal(savedMixed.comparability, 'comparable');
    failBaselineA = false;
    differentHeaders = true;
    const headerDifference = await compareLocalVersions(options, {
      versions,
      run: proofRun,
      env: { API_PROXY_TARGET: 'https://dev.jucha.info' },
    });
    assert.equal(headerDifference.transactionSet, 'transaction_difference');
    assert.equal(headerDifference.pairs[0].transactionComparison, 'transaction_difference');
    assert.equal(headerDifference.pairs[0].coreParkingComparison, 'same_query_same_response');
    assert.equal(headerDifference.pairs[0].interpretation, 'limited');
    assert.equal(headerDifference.dataSnapshot, 'unverified');
    differentHeaders = false;
    responseDiff = true;
    const changedResponse = await compareLocalVersions(options, {
      versions,
      run: proofRun,
      env: { API_PROXY_TARGET: 'https://dev.jucha.info' },
    });
    assert.equal(changedResponse.pairs[0].coreParkingComparison, 'same_query_different_response');
    responseDiff = false;
    mapError = true;
    const mapFailure = await compareLocalVersions(options, {
      versions,
      run: proofRun,
      env: { API_PROXY_TARGET: 'https://dev.jucha.info' },
    });
    assert.equal(mapFailure.pairs[0].mapResources.A, 'error_observed');
    assert.equal(mapFailure.pairs[0].interpretation, 'limited');
    assert.equal(mapFailure.pairs[0].behaviorComparison, 'comparable');
    mapError = false;
    contextOver = true;
    const longContext = await compareLocalVersions(options, {
      versions,
      run: proofRun,
      env: { API_PROXY_TARGET: 'https://dev.jucha.info' },
    });
    assert.equal(longContext.pairs[0].contextReports.A, 'reported_over_limit');
    assert.equal(longContext.pairs[0].behaviorComparison, 'comparable');
    assert.equal(longContext.pairs[0].interpretation, 'limited');
    assert.ok(
      longContext.pairs[0].runs.A.issues.includes('context_reported_over_limit_truncation_unknown'),
    );
    // 저장 직전 섞인 임의 원문도 다시 걸러내고 파일 권한을 제한한다.
    report.runs[0].result.snapshot = 'PRIVATE-SNAPSHOT';
    const output = await saveLocalAb(report, path.join(root, 'reports'));
    const saved = await readFile(path.join(output, 'result.json'), 'utf8');
    assert.doesNotMatch(saved, /PRIVATE-SNAPSHOT|ab-local-/);
    assert.equal((await stat(path.join(output, 'result.json'))).mode & 0o777, 0o600);
    let count = 0;
    const stopped = await compareLocalVersions(options, {
      versions,
      run: async (...args) => {
        const r = await run(...args);
        count++;
        return { ...r, termination: 'policy_violation' };
      },
    });
    assert.equal(stopped.stopped, 'policy_violation');
    assert.equal(count, 1);
    // 연결 종료는 모델 미완료와 달리 공통 실행 경로 오류이므로 다음 조건을 시작하지 않는다.
    for (const termination of ['browser_disconnected', 'mcp_disconnected', 'transport_error']) {
      let started = 0;
      const disconnected = await compareLocalVersions(options, {
        versions,
        executionOrder,
        run: async (...args) => {
          started++;
          return { ...(await run(...args)), termination };
        },
      });
      assert.equal(started, 1);
      assert.equal(disconnected.stopped, termination);
      assert.deepEqual(disconnected.actualOrder, ['A:baseline']);
    }

    await assert.rejects(
      compareLocalVersions(options, {
        versions: [versions[0], { ...versions[1], scenarioReady: false }],
        run,
      }),
    );
    await assert.rejects(
      compareLocalVersions(options, {
        versions: [versions[0], { ...versions[1], dataSourceReviewed: false }],
        run,
      }),
    );
    const changed = await compareLocalVersions(options, {
      versions,
      run: async (...args) => {
        const result = await run(...args);
        await writeFile(path.join(versions[0].clientDirectory, 'src', 'main.js'), '// changed');
        return result;
      },
    });
    assert.equal(changed.stopped, 'screen_changed');
    assert.equal(changed.complete, false);
    await assert.rejects(
      compareLocalVersions(options, {
        versions: [versions[0], { ...versions[1], clientDirectory: versions[0].clientDirectory }],
        run,
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
