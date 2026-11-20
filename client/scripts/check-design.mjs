// 디자인 관련 변경만 빠르게 검사한다.
// 커밋 이후 추가·수정한 줄에 theme 토큰 대신 색상 값(#hex, rgb(), hsl())을 직접 쓰지 않았는지 확인한다.
// 사용법: node scripts/check-design.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src', 'stories'];
const SOURCE_FILE = /\.(?:ts|tsx)$/;
const THEME_FILE = /^src\/theme\//;
// 색상 길이(3·4·6·8자리)의 #hex만 잡는다. 경로·식별자 바로 뒤의 #(예: /setting#add)는 색상으로 보지 않는다.
const RAW_COLOR =
  /(?<![\w/&?=.#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?)\(/;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

const git = (...args) => execFileSync('git', args, { cwd: clientDir, encoding: 'utf8' });

const isTarget = (file) => SOURCE_FILE.test(file) && !THEME_FILE.test(file);

/** 커밋 이후 추가·수정한 줄을 { file, line, text }로 돌려준다. 추적하지 않는 새 파일은 모든 줄이다. */
export const collectChangedLines = () => {
  const changed = [];

  let file = null;
  let lineNumber = 0;
  const diff = git('diff', '--relative', '--unified=0', '--no-color', 'HEAD', '--', ...SCAN_DIRS);
  for (const row of diff.split('\n')) {
    if (row.startsWith('+++ ')) {
      file = row === '+++ /dev/null' ? null : row.slice('+++ b/'.length);
    } else if (row.startsWith('@@')) {
      lineNumber = Number(row.match(/\+(\d+)/)[1]);
    } else if (row.startsWith('+') && file) {
      changed.push({ file, line: lineNumber, text: row.slice(1) });
      lineNumber += 1;
    }
  }

  const untracked = git('ls-files', '--others', '--exclude-standard', '--', ...SCAN_DIRS)
    .split('\n')
    .filter(Boolean);
  for (const newFile of untracked) {
    readFileSync(path.join(clientDir, newFile), 'utf8')
      .split('\n')
      .forEach((text, index) => changed.push({ file: newFile, line: index + 1, text }));
  }

  return changed.filter(({ file: changedFile }) => isTarget(changedFile));
};

/** 주석 줄을 빼고, 색상 값을 직접 쓴 줄만 돌려준다. */
export const findRawColors = (lines) =>
  lines.filter(({ text }) => !COMMENT_LINE.test(text) && RAW_COLOR.test(text));

const main = () => {
  const rawColors = findRawColors(collectChangedLines());
  if (rawColors.length > 0) {
    console.error(
      '색상 값을 직접 썼습니다. src/theme의 토큰(color, palette)을 사용하세요.\n' +
        rawColors.map(({ file, line, text }) => `  ${file}:${line}  ${text.trim()}`).join('\n'),
    );
    process.exit(1);
  }
  console.log('디자인 검사 통과: 변경한 줄에 직접 쓴 색상 값 없음.');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
