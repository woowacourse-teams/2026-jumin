import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';

const testFiles = [...globSync('__tests__/unit/**/*.test.mjs')].sort();

if (testFiles.length === 0) {
  console.error('No client unit tests found');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...testFiles], {
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
