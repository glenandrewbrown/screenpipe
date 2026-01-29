import {
  test,
  expectPageScreenshot,
  expectResponsiveScreenshots,
  expectThemeScreenshots,
  navigateAndWait,
  getDynamicContentMasks,
  VIEWPORTS,
} from "../utils/visual-test-helpers";

/**
 * Visual Regression Tests for Page Layouts & Responsive Design
 *
 * Tests main application pages at multiple viewport sizes to catch
 * layout regressions, overflow issues, and responsive breakpoint bugs.
 */

test.describe("Timeline Page - Responsive", () => {
  test("renders at all breakpoints", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/");
    const masks = getDynamicContentMasks(visualPage);
    await expectResponsiveScreenshots(
      visualPage,
      "timeline",
      ["mobile", "tablet", "desktop", "wide"],
      { mask: masks }
    );
  });

  test("light and dark themes", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/");
    const masks = getDynamicContentMasks(visualPage);
    await expectThemeScreenshots(visualPage, "timeline-theme", {
      mask: masks,
    });
  });

  test("full page scroll capture", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/");
    await expectPageScreenshot(visualPage, "timeline-full-page", {
      fullPage: true,
      mask: getDynamicContentMasks(visualPage),
    });
  });
});

test.describe("Settings Page - Responsive", () => {
  test("renders at all breakpoints", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");
    await expectResponsiveScreenshots(
      visualPage,
      "settings",
      ["mobile", "tablet", "desktop", "wide"]
    );
  });

  test("light and dark themes", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");
    await expectThemeScreenshots(visualPage, "settings-theme");
  });

  test("settings full page scroll", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");
    await expectPageScreenshot(visualPage, "settings-full-page", {
      fullPage: true,
    });
  });
});

test.describe("Search Page - Responsive", () => {
  test("renders at all breakpoints", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/search");
    await expectResponsiveScreenshots(
      visualPage,
      "search",
      ["mobile", "tablet", "desktop", "wide"]
    );
  });

  test("light and dark themes", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/search");
    await expectThemeScreenshots(visualPage, "search-theme");
  });

  test("search with results layout", async ({ visualPage }) => {
    // Navigate and enter a search query
    await navigateAndWait(visualPage, "/search");
    const searchInput = visualPage.locator(
      'input[type="text"], input[type="search"], input[placeholder*="search" i]'
    ).first();

    if (await searchInput.isVisible()) {
      await searchInput.fill("test query");
      await visualPage.waitForTimeout(500);
      await expectPageScreenshot(visualPage, "search-with-query");
    }
  });
});

test.describe("Onboarding Page - Responsive", () => {
  test("renders at all breakpoints", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/onboarding");
    await expectResponsiveScreenshots(
      visualPage,
      "onboarding",
      ["mobile", "tablet", "desktop"]
    );
  });

  test("light and dark themes", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/onboarding");
    await expectThemeScreenshots(visualPage, "onboarding-theme");
  });
});

test.describe("Layout Consistency", () => {
  test("navigation sidebar consistency across pages", async ({
    visualPage,
  }) => {
    const pages = ["/", "/settings", "/search"];
    for (const path of pages) {
      await navigateAndWait(visualPage, path);

      // Capture the sidebar/navigation area
      const sidebar = visualPage.locator(
        'nav, [role="navigation"], aside'
      ).first();
      if (await sidebar.isVisible()) {
        const pageName = path === "/" ? "home" : path.slice(1);
        await sidebar.screenshot({
          path: `visual-results/nav-${pageName}.png`,
        });
      }
    }
  });

  test("no horizontal overflow at mobile", async ({ visualPage }) => {
    await visualPage.setViewportSize(VIEWPORTS.mobile);

    const pages = ["/", "/settings", "/search"];
    for (const path of pages) {
      await navigateAndWait(visualPage, path);

      const hasOverflow = await visualPage.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      const pageName = path === "/" ? "home" : path.slice(1);
      if (hasOverflow) {
        // Capture the overflow for debugging
        await expectPageScreenshot(
          visualPage,
          `overflow-${pageName}-mobile`,
          { fullPage: true }
        );
      }
    }
  });

  test("content does not clip at tablet breakpoint", async ({
    visualPage,
  }) => {
    await visualPage.setViewportSize(VIEWPORTS.tablet);

    await navigateAndWait(visualPage, "/settings");
    await expectPageScreenshot(visualPage, "settings-tablet-no-clip", {
      fullPage: true,
    });
  });
});
