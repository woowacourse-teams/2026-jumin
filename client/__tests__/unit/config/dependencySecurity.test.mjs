import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const requireFromJest = createRequire(require.resolve('jest/package.json'));
const requireFromJestCore = createRequire(requireFromJest.resolve('@jest/core/package.json'));
const requireFromJestConfig = createRequire(
  requireFromJestCore.resolve('jest-config/package.json'),
);
const merge = requireFromJestConfig('deepmerge');

// Storybook이 실제로 해석한 미들웨어를 검사해 잠금 파일의 보안 패치 누락을 감지한다.
const requireFromStorybook = createRequire(
  require.resolve('@storybook/react-webpack5/package.json'),
);
const requireFromBuilder = createRequire(
  requireFromStorybook.resolve('@storybook/builder-webpack5/package.json'),
);
const getFilenameFromUrl = require(
  path.join(
    path.dirname(requireFromBuilder.resolve('webpack-dev-middleware')),
    'utils/getFilenameFromUrl.js',
  ),
);

const createMiddlewareContext = (publicPath) => {
  const outputPath = path.resolve('virtual-storybook-output');
  const accessed = [];

  return {
    outputPath,
    accessed,
    context: {
      options: { publicPath },
      stats: {
        compilation: {
          outputOptions: { path: outputPath },
          getPath: (value) => value,
        },
      },
      // 메모리 파일 시스템을 대신한다. 실제 파일·서버를 만들거나 읽지 않는다.
      outputFileSystem: {
        statSync: (filename) => {
          accessed.push(filename);
          return { isFile: () => true };
        },
      },
    },
  };
};

test('Storybook 미들웨어는 publicPath 접두사를 이용한 출력 폴더 밖 접근을 차단한다', () => {
  for (const url of ['/assets../secret', '/assets%2e%2e/secret', '/assets..%2fsecret']) {
    const { context, accessed } = createMiddlewareContext('/assets');
    const extra = {};

    // 접두사를 제거한 뒤에만 상위 경로가 드러나는 요청을 재현한다.
    assert.equal(getFilenameFromUrl(context, url, extra), undefined);
    assert.equal(extra.errorCode, 403);
    assert.deepEqual(accessed, []);
  }
});

test('Storybook 미들웨어는 정상 에셋과 하위 폴더의 파일 경로를 유지한다', () => {
  for (const publicPath of ['/assets', '/assets/']) {
    const { context, outputPath } = createMiddlewareContext(publicPath);

    // 보안 패치가 정상 요청이나 쿼리 문자열 처리를 막지 않아야 한다.
    for (const asset of ['main.js', 'nested/chunk.js']) {
      assert.equal(
        getFilenameFromUrl(context, `/assets/${asset}?v=1`),
        path.join(outputPath, asset),
      );
    }
  }
});

test('Jest가 사용하는 deepmerge는 반환 객체에 외부 프로토타입을 주입하지 않는다', () => {
  const malicious = JSON.parse('{"__proto__":{"admin":true}}');
  const results = [
    merge(Object.create(null), malicious),
    merge({ session: null }, { session: malicious }).session,
    merge(malicious, {}),
    merge({ list: [] }, { list: [malicious] }).list[0],
  ];

  for (const result of results) {
    assert.equal(result.admin, undefined);
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
  }

  assert.equal({}.admin, undefined);
});

test('deepmerge 보안 패치 후에도 중첩 객체 병합과 배열 연결을 유지한다', () => {
  const target = { nested: { first: 1 }, items: [1] };
  const source = { nested: { second: 2 }, items: [2] };

  assert.deepEqual(merge(target, source), {
    nested: { first: 1, second: 2 },
    items: [1, 2],
  });
  assert.deepEqual(target, { nested: { first: 1 }, items: [1] });
  assert.deepEqual(source, { nested: { second: 2 }, items: [2] });
});
