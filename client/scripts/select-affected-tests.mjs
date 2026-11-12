import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const integrationDirectory = '__tests__/integration/';

const tests = {
  accessibility: `${integrationDirectory}Accessibility.integration.test.tsx`,
  appMapLifecycle: `${integrationDirectory}AppMapLifecycle.integration.test.tsx`,
  destinationSearchApi: `${integrationDirectory}DestinationSearchAPI.integration.test.ts`,
  mapCamera: `${integrationDirectory}MapCamera.integration.test.tsx`,
  mapInitialization: `${integrationDirectory}MapInitialization.integration.test.tsx`,
  msw: `${integrationDirectory}MSW.integration.test.ts`,
  parkingDetailApi: `${integrationDirectory}ParkingDetailAPI.integration.test.ts`,
  parkingMockLocation: `${integrationDirectory}ParkingMockLocation.integration.test.ts`,
  parkingQuery: `${integrationDirectory}ParkingQuery.integration.test.tsx`,
  parkingRecommend: `${integrationDirectory}ParkingRecommend.integration.test.tsx`,
  useParkingSetupMap: `${integrationDirectory}useParkingSetupMap.integration.test.tsx`,
};

const pageRules = [
  {
    prefix: 'client/src/pages/SearchPage/',
    jestFiles: [
      tests.accessibility,
      tests.appMapLifecycle,
      tests.destinationSearchApi,
      tests.msw,
      tests.parkingQuery,
    ],
    e2eTags: ['@search', '@setup', '@recommend'],
  },
  {
    prefix: 'client/src/pages/ParkingSetupPage/',
    jestFiles: [
      tests.appMapLifecycle,
      tests.mapInitialization,
      tests.parkingQuery,
      tests.parkingRecommend,
      tests.useParkingSetupMap,
    ],
    e2eTags: ['@setup', '@recommend'],
  },
  {
    prefix: 'client/src/pages/ParkingRecommendPage/',
    jestFiles: null, // 상세 액션과 지도 계약을 함께 사용하므로 통합 테스트 전체를 실행한다.
    e2eTags: ['@recommend', '@parking-detail', '@directions'],
  },
  {
    prefix: 'client/src/pages/RecentUsePage/',
    jestFiles: [tests.appMapLifecycle],
    e2eTags: ['@recent', '@directions'],
  },
  {
    prefix: 'client/src/pages/SettingPage/',
    jestFiles: [tests.appMapLifecycle],
    e2eTags: ['@setting', '@setting-layout', '@navigation'],
  },
  {
    prefix: 'client/src/pages/LandingPage/',
    jestFiles: [tests.appMapLifecycle],
    e2eTags: ['@setting', '@navigation'],
  },
];

const destinationApiPaths = new Set([
  'client/src/api/destination.ts',
  'client/src/api/destinationSchema.ts',
  'client/src/api/queries/destinationSearchQueryOptions.ts',
]);

const full = (reason) => ({
  jestMode: 'all',
  e2eMode: 'all',
  jestFiles: [],
  e2eTags: [],
  reasons: [reason],
});

/** 테스트가 없는 변경에서만 두 실행기를 건너뛴다. 정적 검사와 빌드는 CI에서 별도로 실행한다. */
export const classifyChangedPaths = (
  changedPaths,
  { pathExists = (file) => existsSync(path.join(repositoryRoot, file)) } = {},
) => {
  const jestFiles = new Set();
  const e2eTags = new Set();
  const reasons = [];
  let runAllJest = false;
  let runAllE2e = false;

  for (const file of changedPaths) {
    if (!file.startsWith('client/') && !file.startsWith('.github/workflows/client-')) continue;

    // --no-renames로 이름 변경을 삭제와 추가로 다루며, 삭제된 경로는 전체 실행한다.
    if (!pathExists(file)) return full(`${file}: 삭제되었거나 이동한 파일`);

    if (/^\.github\/workflows\/client-(ci|dev-cd|prod-cd)\.yml$/.test(file)) {
      return full(`${file}: 클라이언트 CI 또는 배포 설정`);
    }
    if (!file.startsWith('client/')) continue;

    if (file === 'client/README.md' || file.startsWith('client/docs/')) {
      reasons.push(`${file}: 문서`);
      continue;
    }
    if (file.startsWith('client/stories/') || file.startsWith('client/.storybook/')) {
      reasons.push(`${file}: Storybook에서 별도로 확인`);
      continue;
    }
    if (file.startsWith('client/src/pages/AdminPage/')) {
      reasons.push(`${file}: Admin 기능 테스트 제외`);
      continue;
    }
    if (file.startsWith('client/__tests__/unit/')) {
      reasons.push(`${file}: Node 단위 테스트를 별도로 실행`);
      continue;
    }

    if (/^client\/__tests__\/integration\/[A-Za-z0-9._-]+\.integration\.test\.tsx?$/.test(file)) {
      jestFiles.add(file.slice('client/'.length));
      reasons.push(`${file}: 변경한 통합 테스트 파일`);
      continue;
    }
    if (file.startsWith('client/__tests__/e2e/')) {
      runAllE2e = true;
      reasons.push(`${file}: E2E 테스트 또는 공통 도우미`);
      continue;
    }

    if (file.startsWith('client/src/pages/HomePage/')) {
      // 홈 마커와 필터의 사용자 동작은 현재 E2E가 직접 검증하지 않는다.
      return full(`${file}: 홈 지도와 상세 동작이 함께 변경될 수 있음`);
    }

    if (destinationApiPaths.has(file)) {
      for (const test of [
        tests.appMapLifecycle,
        tests.destinationSearchApi,
        tests.msw,
        tests.parkingQuery,
        tests.parkingRecommend,
      ]) {
        jestFiles.add(test);
      }
      for (const tag of ['@search', '@setup', '@recommend']) e2eTags.add(tag);
      reasons.push(`${file}: 목적지 검색과 추천 전환`);
      continue;
    }

    const rule = pageRules.find(({ prefix }) => file.startsWith(prefix));
    if (rule) {
      if (rule.jestFiles === null) runAllJest = true;
      else for (const test of rule.jestFiles) jestFiles.add(test);
      for (const tag of rule.e2eTags) e2eTags.add(tag);
      reasons.push(`${file}: ${rule.prefix} 흐름`);
      continue;
    }

    // 공통 컴포넌트, API, mock, 설정, 새 파일의 영향 범위는 추측하지 않는다.
    return full(`${file}: 선택 규칙에 없는 클라이언트 파일`);
  }

  if (e2eTags.size > 0) e2eTags.add('@smoke');
  return {
    jestMode: runAllJest ? 'all' : jestFiles.size > 0 ? 'files' : 'skip',
    e2eMode: runAllE2e ? 'all' : e2eTags.size > 0 ? 'tags' : 'skip',
    jestFiles: runAllJest ? [] : [...jestFiles].sort(),
    e2eTags: runAllE2e ? [] : [...e2eTags].sort(),
    reasons,
  };
};

const changedPathsFromGit = (range) =>
  execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', range], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);

const planForEvent = () => {
  const event = process.env.EVENT_NAME;
  if (event === 'workflow_dispatch') return { paths: [], plan: full('수동 실행') };
  if (event === 'push') return { paths: [], plan: full('병합 후 push는 전체 검증') };
  if (event !== 'pull_request' || process.env.PR_BASE_REF !== 'develop') {
    return { paths: [], plan: full('develop 대상 PR 외에는 전체 검증') };
  }

  const { PR_BASE, PR_HEAD } = process.env;
  if (!PR_BASE || !PR_HEAD) return { paths: [], plan: full('PR 비교 커밋을 확인할 수 없음') };

  try {
    const paths = changedPathsFromGit(`${PR_BASE}...${PR_HEAD}`);
    return { paths, plan: classifyChangedPaths(paths) };
  } catch (error) {
    return { paths: [], plan: full(`git diff 실패: ${error.message}`) };
  }
};

const main = () => {
  const isDryRun = process.argv[2] === '--files';
  const { paths, plan } = isDryRun
    ? {
        paths: process.argv.slice(3),
        plan: classifyChangedPaths(process.argv.slice(3)),
      }
    : planForEvent();

  console.log(JSON.stringify({ changedPaths: paths, ...plan }, null, 2));

  if (!isDryRun && process.env.GITHUB_OUTPUT && process.env.RUNNER_TEMP) {
    writeFileSync(
      path.join(process.env.RUNNER_TEMP, 'jest-files.txt'),
      `${plan.jestFiles.join('\n')}\n`,
    );
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `jest_mode=${plan.jestMode}\ne2e_mode=${plan.e2eMode}\ne2e_pattern=${plan.e2eTags.join('|')}\n`,
    );
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
