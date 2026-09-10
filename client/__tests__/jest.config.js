module.exports = {
  rootDir: '..',
  testEnvironment: '<rootDir>/__tests__/jestEnvironment.cjs',
  testEnvironmentOptions: {
    url: 'http://localhost/',
  },
  testMatch: [
    '<rootDir>/__tests__/**/*.integration.test.ts',
    '<rootDir>/__tests__/**/*.integration.test.tsx',
  ],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setupTests.ts'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 10_000,

  transform: {
    '^.+\\.(ts|tsx)$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: true,
          },
          transform: {
            react: {
              runtime: 'automatic',
            },
          },
        },
        module: {
          type: 'es6',
        },
      },
    ],
  },
  moduleNameMapper: {
    '\\.(css|png|svg|jpg|jpeg|gif|woff|woff2|eot|ttf|otf)$': '<rootDir>/__tests__/fileMock.cjs',
  },
};
