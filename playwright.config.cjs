const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/layout',
  timeout: 20000,
  // GitHub's Windows runner launches Firefox and installed Edge more reliably
  // in sequence. Parallel browser startups have repeatedly exhausted the
  // 20-second per-test budget despite the same cases passing independently.
  workers: process.env.CI && process.platform === 'win32' ? 1 : 2,
  reporter: 'list',
  use: { headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'chrome-layout', use: { browserName: 'chromium' } },
    { name: 'firefox-layout', use: { browserName: 'firefox' } },
    // Windows CI has Edge installed; opt in locally when Edge is available.
    ...(process.env.LEAFWISE_EDGE_TESTS === '1'
      ? [{ name: 'edge-layout', use: { browserName: 'chromium', channel: 'msedge' } }]
      : [])
  ]
});
