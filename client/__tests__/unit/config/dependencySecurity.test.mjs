import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const requireFromJest = createRequire(require.resolve('jest/package.json'));
const requireFromJestCore = createRequire(requireFromJest.resolve('@jest/core/package.json'));
const requireFromJestConfig = createRequire(
  requireFromJestCore.resolve('jest-config/package.json'),
);
const merge = requireFromJestConfig('deepmerge');

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
