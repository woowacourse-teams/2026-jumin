import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { classifyChangedPaths } from '../../../scripts/select-affected-tests.mjs';

// 선택 규칙 자체의 누락이 CI에서 필요한 회귀 테스트를 생략하지 않도록 대표 변경을 확인한다.
const select = (...paths) => classifyChangedPaths(paths, { pathExists: () => true });

test('검색 화면 변경은 검색과 추천 진입 테스트를 함께 고른다', () => {
  const plan = select('client/src/pages/SearchPage/SearchPage.tsx');

  assert.equal(plan.jestMode, 'files');
  assert.equal(plan.e2eMode, 'tags');
  assert.ok(
    plan.jestFiles.includes('__tests__/integration/DestinationSearchAPI.integration.test.ts'),
  );
  assert.ok(plan.jestFiles.includes('__tests__/integration/ParkingQuery.integration.test.tsx'));
  assert.deepEqual(plan.e2eTags, ['@recommend', '@search', '@setup', '@smoke']);
});

test('서로 다른 화면의 변경은 테스트 목록과 태그를 합쳐 실행한다', () => {
  const plan = select(
    'client/src/pages/SearchPage/SearchPage.tsx',
    'client/src/pages/SettingPage/SettingPage.tsx',
  );

  assert.equal(plan.jestMode, 'files');
  assert.equal(new Set(plan.jestFiles).size, plan.jestFiles.length);
  assert.ok(plan.jestFiles.includes('__tests__/integration/AppMapLifecycle.integration.test.tsx'));
  assert.ok(plan.e2eTags.includes('@search'));
  assert.ok(plan.e2eTags.includes('@setting-layout'));
});

test('mock과 분류되지 않은 클라이언트 파일은 전체 실행으로 돌아간다', () => {
  for (const file of [
    'client/mocks/handlers/parkingSearchHandlers.ts',
    'client/src/shared/maps/MapLayout.tsx',
    'client/src/pages/NewPage/NewPage.tsx',
  ]) {
    const plan = select(file);
    assert.equal(plan.jestMode, 'all', file);
    assert.equal(plan.e2eMode, 'all', file);
  }
});

test('Admin만 변경하면 기능 테스트를 선택하지 않는다', () => {
  const plan = select('client/src/pages/AdminPage/AdminPage.tsx');

  assert.equal(plan.jestMode, 'skip');
  assert.equal(plan.e2eMode, 'skip');
});

test('클라이언트 외부 파일을 삭제해도 클라이언트 테스트를 선택하지 않는다', () => {
  const plan = classifyChangedPaths(['server/src/OldController.java'], {
    pathExists: () => false,
  });

  assert.equal(plan.jestMode, 'skip');
  assert.equal(plan.e2eMode, 'skip');
});

test('테스트 자체를 변경하면 해당 통합 파일 또는 E2E 전체를 실행한다', () => {
  const integration = select('client/__tests__/integration/ParkingLike.integration.test.tsx');
  assert.deepEqual(integration.jestFiles, [
    '__tests__/integration/ParkingLike.integration.test.tsx',
  ]);
  assert.equal(integration.e2eMode, 'skip');

  const e2e = select('client/__tests__/e2e/dismissSurveyIfPresent.ts');
  assert.equal(e2e.jestMode, 'skip');
  assert.equal(e2e.e2eMode, 'all');
});

test('경로 목록에 줄바꿈을 넣을 수 있는 통합 테스트 이름은 전체 실행한다', () => {
  const plan = select('client/__tests__/integration/Unsafe\n--flag.integration.test.ts');

  assert.equal(plan.jestMode, 'all');
  assert.equal(plan.e2eMode, 'all');
});

test('삭제되거나 이동한 파일은 기존 영향을 알 수 없으므로 전체 실행한다', () => {
  const plan = classifyChangedPaths(['client/src/pages/SearchPage/OldSearchPage.tsx'], {
    pathExists: () => false,
  });

  assert.equal(plan.jestMode, 'all');
  assert.equal(plan.e2eMode, 'all');
});

test('수동 CI 실행은 전체 실행 모드를 다음 단계에 전달한다', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'jumin-test-selection-'));
  const output = path.join(directory, 'github-output');
  const script = fileURLToPath(
    new URL('../../../scripts/select-affected-tests.mjs', import.meta.url),
  );
  writeFileSync(output, '');

  try {
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        EVENT_NAME: 'workflow_dispatch',
        GITHUB_OUTPUT: output,
        RUNNER_TEMP: directory,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(output, 'utf8'), /jest_mode=all\ne2e_mode=all\ne2e_pattern=\n/);
    assert.ok(existsSync(path.join(directory, 'jest-files.txt')));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
