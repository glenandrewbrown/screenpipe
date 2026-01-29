import {
  test,
  expectPageScreenshot,
  expectElementScreenshot,
  expectHoverScreenshot,
  navigateAndWait,
  setTheme,
} from "../utils/visual-test-helpers";

/**
 * Visual Regression Tests for Core UI Components
 *
 * Tests the visual appearance of shadcn/ui components rendered
 * in the screenpipe app. Components are tested via pages that
 * naturally include them (settings, timeline, etc.).
 *
 * Baseline snapshots are stored in __snapshots__/ and committed to git.
 * Run `bun run test:visual:update` to regenerate baselines after
 * intentional design changes.
 */

test.describe("UI Components - Settings Page", () => {
  test.beforeEach(async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");
  });

  test("settings page renders correctly", async ({ visualPage }) => {
    await expectPageScreenshot(visualPage, "settings-page-default");
  });

  test("settings page dark mode", async ({ visualPage }) => {
    await setTheme(visualPage, "dark");
    await expectPageScreenshot(visualPage, "settings-page-dark");
  });

  test("tabs component visual state", async ({ visualPage }) => {
    const tabs = visualPage.locator('[role="tablist"]').first();
    if (await tabs.isVisible()) {
      await expectElementScreenshot(tabs, "settings-tabs-default");

      // Click second tab if available
      const tabItems = tabs.locator('[role="tab"]');
      const count = await tabItems.count();
      if (count > 1) {
        await tabItems.nth(1).click();
        await visualPage.waitForTimeout(200);
        await expectElementScreenshot(tabs, "settings-tabs-second-active");
      }
    }
  });

  test("switch component states", async ({ visualPage }) => {
    const switches = visualPage.locator('[role="switch"]');
    const count = await switches.count();

    if (count > 0) {
      const firstSwitch = switches.first();
      await expectElementScreenshot(firstSwitch, "switch-off-state");

      await firstSwitch.click();
      await visualPage.waitForTimeout(200);
      await expectElementScreenshot(firstSwitch, "switch-on-state");
    }
  });

  test("input field states", async ({ visualPage }) => {
    const input = visualPage.locator("input[type='text']").first();
    if (await input.isVisible()) {
      await expectElementScreenshot(input, "input-empty");

      await input.click();
      await expectElementScreenshot(input, "input-focused");

      await input.fill("Test input value");
      await expectElementScreenshot(input, "input-filled");
    }
  });

  test("select component", async ({ visualPage }) => {
    const select = visualPage.locator('[role="combobox"]').first();
    if (await select.isVisible()) {
      await expectElementScreenshot(select, "select-closed");

      await select.click();
      await visualPage.waitForTimeout(300);
      await expectPageScreenshot(visualPage, "select-open-dropdown");
    }
  });

  test("button variants", async ({ visualPage }) => {
    const buttons = visualPage.locator("button:visible");
    const count = await buttons.count();

    if (count > 0) {
      // Capture the first few visible buttons
      for (let i = 0; i < Math.min(count, 3); i++) {
        const btn = buttons.nth(i);
        const text = await btn.textContent();
        const safeName = (text || `button-${i}`).replace(/\W+/g, "-").slice(0, 30);

        await expectElementScreenshot(btn, `button-${safeName}-default`);
        await expectHoverScreenshot(btn, `button-${safeName}`);
      }
    }
  });
});

test.describe("UI Components - Timeline Page", () => {
  test.beforeEach(async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/");
  });

  test("timeline page renders correctly", async ({ visualPage }) => {
    await expectPageScreenshot(visualPage, "timeline-page-default");
  });

  test("timeline page dark mode", async ({ visualPage }) => {
    await setTheme(visualPage, "dark");
    await expectPageScreenshot(visualPage, "timeline-page-dark");
  });

  test("progress bar component", async ({ visualPage }) => {
    const progress = visualPage.locator('[role="progressbar"]').first();
    if (await progress.isVisible()) {
      await expectElementScreenshot(progress, "progress-bar");
    }
  });

  test("scroll area component", async ({ visualPage }) => {
    const scrollArea = visualPage.locator("[data-radix-scroll-area-viewport]").first();
    if (await scrollArea.isVisible()) {
      await expectElementScreenshot(scrollArea, "scroll-area");
    }
  });
});

test.describe("UI Components - Search Page", () => {
  test.beforeEach(async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/search");
  });

  test("search page renders correctly", async ({ visualPage }) => {
    await expectPageScreenshot(visualPage, "search-page-default");
  });

  test("search page dark mode", async ({ visualPage }) => {
    await setTheme(visualPage, "dark");
    await expectPageScreenshot(visualPage, "search-page-dark");
  });
});

test.describe("UI Components - Dialog & Popover", () => {
  test("dialog opens and renders", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");

    // Look for a button that triggers a dialog
    const dialogTriggers = visualPage.locator(
      'button:has-text("add"), button:has-text("new"), button:has-text("create")'
    );

    if ((await dialogTriggers.count()) > 0) {
      await dialogTriggers.first().click();
      await visualPage.waitForTimeout(300);

      const dialog = visualPage.locator('[role="dialog"]');
      if (await dialog.isVisible()) {
        await expectElementScreenshot(dialog, "dialog-open");
      }
    }
  });

  test("tooltip appears on hover", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");

    const tooltipTriggers = visualPage.locator("[data-state][data-radix-tooltip-trigger]");
    if ((await tooltipTriggers.count()) > 0) {
      await tooltipTriggers.first().hover();
      await visualPage.waitForTimeout(500);
      await expectPageScreenshot(visualPage, "tooltip-visible");
    }
  });
});

test.describe("UI Components - Badges & Alerts", () => {
  test("badge variants on settings page", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");

    const badges = visualPage.locator(".inline-flex.items-center.rounded");
    const count = await badges.count();

    for (let i = 0; i < Math.min(count, 4); i++) {
      await expectElementScreenshot(badges.nth(i), `badge-variant-${i}`);
    }
  });
});
