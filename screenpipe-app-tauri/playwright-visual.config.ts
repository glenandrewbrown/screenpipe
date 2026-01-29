import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright Configuration for Visual Regression Testing
 *
 * Dedicated config for visual testing, separate from E2E tests.
 * Focuses on screenshot comparison, responsive design validation,
 * and accessibility visual checks.
 *
 * Usage:
 *   bun run test:visual              # Run all visual tests
 *   bun run test:visual:update       # Update baselines
 *   bun run test:visual:report       # Open HTML report
 */

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./visual-tests",
  testMatch: "**/*.visual.ts",

  // Visual tests should not run in parallel to avoid flakiness
  fullyParallel: false,
  forbidOnly: CI,

  // More retries for visual tests (rendering can be flaky)
  retries: CI ? 3 : 1,

  // Single worker for consistency
  workers: 1,

  reporter: [
    ["list"],
    [
      "html",
      {
        open: CI ? "never" : "on-failure",
        outputFolder: "visual-report",
      },
    ],
    ["json", { outputFile: "visual-report/results.json" }],
  ],

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",

    // Always collect traces for visual tests (helpful for debugging diffs)
    trace: "retain-on-failure",

    // Always screenshot for visual tests
    screenshot: "on",

    // No video needed for visual tests
    video: "off",

    actionTimeout: 10000,

    // Consistent viewport for baseline comparison
    viewport: { width: 1280, height: 720 },

    // Consistent timezone
    timezoneId: "America/Los_Angeles",

    // Consistent locale
    locale: "en-US",

    // Consistent color scheme
    colorScheme: "light",
  },

  timeout: 30000,

  expect: {
    timeout: 5000,

    toHaveScreenshot: {
      // Allow small anti-aliasing differences across platforms
      maxDiffPixelRatio: 0.01,
      // Pixel-level threshold (0 = exact, 1 = any color)
      threshold: 0.2,
      // Animation settling time
      animations: "disabled",
    },

    toMatchSnapshot: {
      maxDiffPixelRatio: 0.01,
    },
  },

  projects: [
    // ── Desktop Browsers ──────────────────────────────
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "desktop-firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "desktop-safari",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1280, height: 720 },
      },
    },

    // ── Responsive Breakpoints ────────────────────────
    {
      name: "mobile-portrait",
      use: {
        ...devices["iPhone 14"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "tablet-landscape",
      use: {
        ...devices["iPad (gen 7) landscape"],
        viewport: { width: 1080, height: 810 },
      },
    },
    {
      name: "desktop-wide",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },

    // ── Dark Mode ─────────────────────────────────────
    {
      name: "dark-mode",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        colorScheme: "dark",
      },
    },

    // ── Accessibility: Reduced Motion ─────────────────
    {
      name: "reduced-motion",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !CI,
    timeout: 120000,
    stdout: "pipe",
    stderr: "pipe",
  },

  // Snapshot output directory
  snapshotDir: "./visual-tests/__snapshots__",

  outputDir: "visual-results",
});
