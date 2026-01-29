import { test as base, expect, Page, Locator } from "@playwright/test";
import {
  mockHealthEndpoint,
  mockSearchEndpoint,
  mockFramesEndpoint,
} from "../../e2e-playwright/utils/api";

// ─── Viewport Presets ─────────────────────────────────────────────

export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 1080, height: 810 },
  desktop: { width: 1280, height: 720 },
  wide: { width: 1920, height: 1080 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

// ─── Screenshot Options ───────────────────────────────────────────

export interface VisualCompareOptions {
  /** Max percentage of pixels that can differ (0-1) */
  maxDiffPixelRatio?: number;
  /** Per-pixel color threshold (0-1, 0 = exact match) */
  threshold?: number;
  /** Mask dynamic areas (dates, counters, etc.) */
  mask?: Locator[];
  /** Capture full page or just viewport */
  fullPage?: boolean;
}

const DEFAULT_OPTIONS: VisualCompareOptions = {
  maxDiffPixelRatio: 0.01,
  threshold: 0.2,
  fullPage: false,
};

// ─── Visual Test Fixtures ─────────────────────────────────────────

type VisualFixtures = {
  visualPage: Page;
};

/**
 * Extended test with visual testing fixtures.
 * Pre-configures the page with API mocks and reduced animations.
 */
export const test = base.extend<VisualFixtures>({
  visualPage: async ({ page }, use) => {
    // Disable animations for consistent screenshots
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
    });

    // Mock backend APIs so pages render without a running server
    await mockHealthEndpoint(page, true);
    await mockSearchEndpoint(page, []);
    await mockFramesEndpoint(page, []);

    // Mock Tauri APIs that throw in browser context
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__TAURI_INTERNALS__ = {
        invoke: () => Promise.resolve(null),
        transformCallback: () => 0,
      };
    });

    await use(page);
  },
});

export { expect };

// ─── Screenshot Helpers ───────────────────────────────────────────

/**
 * Compare a full page screenshot against baseline.
 */
export async function expectPageScreenshot(
  page: Page,
  name: string,
  options?: VisualCompareOptions
) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300); // settle rendering

  await expect(page).toHaveScreenshot(`${name}.png`, {
    maxDiffPixelRatio: opts.maxDiffPixelRatio,
    threshold: opts.threshold,
    mask: opts.mask,
    fullPage: opts.fullPage,
    animations: "disabled",
  });
}

/**
 * Compare an element screenshot against baseline.
 */
export async function expectElementScreenshot(
  locator: Locator,
  name: string,
  options?: VisualCompareOptions
) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  await locator.waitFor({ state: "visible" });

  await expect(locator).toHaveScreenshot(`${name}.png`, {
    maxDiffPixelRatio: opts.maxDiffPixelRatio,
    threshold: opts.threshold,
    mask: opts.mask,
    animations: "disabled",
  });
}

/**
 * Compare page across multiple viewports.
 * Generates separate snapshots per viewport.
 */
export async function expectResponsiveScreenshots(
  page: Page,
  baseName: string,
  viewports: ViewportName[] = ["mobile", "tablet", "desktop"],
  options?: VisualCompareOptions
) {
  for (const vp of viewports) {
    const size = VIEWPORTS[vp];
    await page.setViewportSize(size);
    await page.waitForTimeout(300);
    await expectPageScreenshot(page, `${baseName}-${vp}`, options);
  }
}

// ─── Theme Helpers ────────────────────────────────────────────────

/**
 * Set the color theme (light/dark) via next-themes.
 */
export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(t);
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.style.colorScheme = t;
    localStorage.setItem("theme", t);
  }, theme);
  await page.waitForTimeout(200);
}

/**
 * Capture both light and dark mode screenshots.
 */
export async function expectThemeScreenshots(
  page: Page,
  baseName: string,
  options?: VisualCompareOptions
) {
  await setTheme(page, "light");
  await expectPageScreenshot(page, `${baseName}-light`, options);

  await setTheme(page, "dark");
  await expectPageScreenshot(page, `${baseName}-dark`, options);
}

// ─── Interaction Helpers ──────────────────────────────────────────

/**
 * Hover an element and capture its visual state.
 */
export async function expectHoverScreenshot(
  locator: Locator,
  name: string,
  options?: VisualCompareOptions
) {
  await locator.hover();
  await locator.page().waitForTimeout(150);
  await expectElementScreenshot(locator, `${name}-hover`, options);
}

/**
 * Focus an element and capture its visual state (for focus ring testing).
 */
export async function expectFocusScreenshot(
  locator: Locator,
  name: string,
  options?: VisualCompareOptions
) {
  await locator.focus();
  await locator.page().waitForTimeout(150);
  await expectElementScreenshot(locator, `${name}-focus`, options);
}

// ─── Accessibility Visual Helpers ─────────────────────────────────

/**
 * Inject axe-core and run accessibility analysis, returning violations.
 * Note: requires `@axe-core/playwright` or injects axe-core from CDN.
 */
export async function getAccessibilityViolations(page: Page) {
  // Inject axe-core
  await page.addScriptTag({
    url: "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js",
  });

  // Run analysis
  const violations = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axe = (window as any).axe;
    if (!axe) return [];
    const results = await axe.run();
    return results.violations;
  });

  return violations as Array<{
    id: string;
    impact: string;
    description: string;
    nodes: Array<{ html: string; target: string[] }>;
  }>;
}

/**
 * Assert that the page has no critical accessibility violations.
 */
export async function expectNoAccessibilityViolations(
  page: Page,
  options?: { impactFilter?: string[] }
) {
  const violations = await getAccessibilityViolations(page);
  const impactFilter = options?.impactFilter || [
    "critical",
    "serious",
  ];

  const filtered = violations.filter((v) =>
    impactFilter.includes(v.impact)
  );

  if (filtered.length > 0) {
    const summary = filtered
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} occurrences)`
      )
      .join("\n");
    throw new Error(
      `Found ${filtered.length} accessibility violations:\n${summary}`
    );
  }
}

/**
 * Tab through focusable elements and capture focus ring visibility.
 */
export async function captureTabOrder(
  page: Page,
  baseName: string,
  tabCount: number = 5
) {
  // Start from body
  await page.keyboard.press("Tab");

  for (let i = 0; i < tabCount; i++) {
    await page.waitForTimeout(100);
    await expect(page).toHaveScreenshot(
      `${baseName}-tab-${i + 1}.png`,
      {
        maxDiffPixelRatio: 0.02,
        threshold: 0.3,
        animations: "disabled",
      }
    );
    await page.keyboard.press("Tab");
  }
}

// ─── Page Setup Helpers ───────────────────────────────────────────

/**
 * Navigate to a page and wait for it to be fully rendered.
 */
export async function navigateAndWait(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
}

/**
 * Mask dynamic content (timestamps, counters) to reduce false positives.
 */
export function getDynamicContentMasks(page: Page): Locator[] {
  return [
    page.locator("time"),
    page.locator("[data-testid='timestamp']"),
    page.locator("[data-testid='counter']"),
    page.locator("[data-testid='version']"),
  ];
}
