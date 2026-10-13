import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const configUrl = new URL('../../../webpack.config.js', import.meta.url);
const configPath = fileURLToPath(configUrl);
const clientDirectory = path.dirname(configPath);
const realRequire = createRequire(configUrl);

// Stub only the uploader so tests never send source files or credentials to Sentry.
const createConfig = (environment, mode = 'production') => {
  const uploads = [];
  const module = { exports: {} };
  const require = (name) => {
    if (name === '@sentry/webpack-plugin') {
      return {
        sentryWebpackPlugin(options) {
          uploads.push(options);
          return { sentryUploader: true, apply() {} };
        },
      };
    }
    return realRequire(name);
  };
  require.resolve = realRequire.resolve;

  vm.runInNewContext(readFileSync(configPath, 'utf8'), {
    module,
    require,
    __dirname: clientDirectory,
    process: { env: environment },
  });

  return { config: module.exports({}, { mode }), uploads };
};

const uploadEnvironment = {
  SENTRY_UPLOAD_SOURCEMAPS: 'true',
  SENTRY_AUTH_TOKEN: 'test-token-not-a-real-credential',
  SENTRY_ORG: 'test-org',
  SENTRY_PROJECT: 'test-project',
  SENTRY_DSN: 'test-dsn',
};

test('local and PR production builds generate hidden maps without uploading', () => {
  const { config, uploads } = createConfig({});
  assert.equal(config.devtool, 'hidden-source-map');
  assert.equal(uploads.length, 0);
});

test('development server does not upload maps even if credentials are present', () => {
  const { SENTRY_UPLOAD_SOURCEMAPS: _, ...credentials } = uploadEnvironment;
  const { config, uploads } = createConfig(credentials, 'development');
  assert.equal(config.devtool, 'eval');
  assert.equal(uploads.length, 0);
});

test('CD uploads only build assets and removes maps before artifact creation', () => {
  const { config, uploads } = createConfig(uploadEnvironment);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].authToken, uploadEnvironment.SENTRY_AUTH_TOKEN);
  assert.equal(uploads[0].org, uploadEnvironment.SENTRY_ORG);
  assert.equal(uploads[0].project, uploadEnvironment.SENTRY_PROJECT);
  assert.equal(uploads[0].sourcemaps.assets, path.join(clientDirectory, 'dist/assets/**'));
  assert.deepEqual(Array.from(uploads[0].sourcemaps.filesToDeleteAfterUpload), [
    path.join(clientDirectory, 'dist/**/*.map'),
  ]);
  const uploadError = new Error('Source map upload failed');
  assert.throws(
    () => uploads[0].errorHandler(uploadError),
    (error) => error === uploadError,
  );
  assert.equal(uploads[0].telemetry, false);
  const defines = config.plugins.find((plugin) => plugin.definitions)?.definitions;
  assert.ok(defines);
  assert.ok(!JSON.stringify(defines).includes(uploadEnvironment.SENTRY_AUTH_TOKEN));
  assert.equal(config.plugins.at(-1).sentryUploader, true);
});

for (const name of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_DSN']) {
  test(`CD fails before building when ${name} is missing`, () => {
    assert.throws(() => createConfig({ ...uploadEnvironment, [name]: ' ' }), {
      message: `Missing required Sentry build variable: ${name}`,
    });
  });
}

test('upload flag cannot silently skip uploads in development mode', () => {
  assert.throws(() => createConfig(uploadEnvironment, 'development'), {
    message: 'Sentry source map upload requires a production-mode build.',
  });
});
