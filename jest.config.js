// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  // This suite is black-box: every request is a real network round trip to
  // a separately running server, so it gets more headroom than Jest's 5s
  // default -- especially the RBAC-matrix and capstone suites, which make
  // several sequential requests per test.
  testTimeout: 20000,
  // Black-box tests never import the app under test, so there is no shared
  // in-process resource (a listening port, a module registry) for parallel
  // workers to collide over. Unlike the course's own in-process suite, this
  // one does not need maxWorkers: 1 -- it is left at Jest's default on
  // purpose, as a deliberate point of contrast with that module.
  reporters: ['default', ['jest-html-reporters', { publicPath: './html-report', filename: 'report.html' }]],
};
