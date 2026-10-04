import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  // Software-rendered maps and CPU-throttled checks compete on hosted runners.
  workers: process.env.CI ? 1 : 3,
  timeout: process.env.CI ? 60_000 : 35_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1100 },
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chromium' }),
      args: ['--enable-unsafe-swiftshader'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: { command: 'npm run preview -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
