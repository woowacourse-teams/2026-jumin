import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findRawColors } from '../../../scripts/check-design.mjs';

// design:check가 theme 토큰 대신 직접 쓴 색상만 잡고, 색상이 아닌 #은 넘기는지 확인한다.
const flagged = (...texts) =>
  findRawColors(texts.map((text, index) => ({ file: 'src/a.ts', line: index + 1, text }))).map(
    ({ text }) => text,
  );

test('직접 쓴 #hex·rgb()·hsl() 색상을 잡는다', () => {
  const lines = [
    '  color: #fff;',
    "  background: '#4356D8',",
    '  border-color: #101b377a;',
    '  box-shadow: 0 2px 6px rgb(16 27 55 / 4%);',
    '  color: hsl(230 65% 55%);',
  ];

  assert.deepEqual(flagged(...lines), lines);
});

test('theme 토큰, 주석, URL 해시, 색상 길이가 아닌 #은 잡지 않는다', () => {
  assert.deepEqual(
    flagged(
      '  color: ${color.text.primary};',
      '  // 예전 값 #4356D8은 토큰으로 바꿨다.',
      '   * 배경은 rgb(0 0 0 / 50%)가 아니라 overlay.scrim을 쓴다.',
      "  navigate('/setting#add');",
      "  const id = 'section#face';",
      "  const anchor = '#ab';",
    ),
    [],
  );
});
