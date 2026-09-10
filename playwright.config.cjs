const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/layout',
  timeout: 20000,
  workers: 2,
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
