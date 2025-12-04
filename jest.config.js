export default {
  testEnvironment: './jest-environment.cjs',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  testTimeout: 10000
};
