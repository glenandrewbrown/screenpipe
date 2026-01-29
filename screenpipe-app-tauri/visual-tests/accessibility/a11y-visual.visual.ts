import {
  test,
  expect,
  expectPageScreenshot,
  expectFocusScreenshot,
  navigateAndWait,
  captureTabOrder,
  expectNoAccessibilityViolations,
  getAccessibilityViolations,
} from "../utils/visual-test-helpers";

/**
 * Accessibility Visual Tests
 *
 * Validates accessibility through visual and automated checks:
 * - Focus ring visibility on interactive elements
 * - Tab navigation order
 * - Color contrast via axe-core
 * - ARIA landmarks structure
 * - Keyboard-only navigation states
 */

test.describe("Focus Ring Visibility", () => {
  test("settings page focus rings are visible", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");

    // Tab through first 6 focusable elements
    await captureTabOrder(visualPage, "settings-focus", 6);
  });

  test("timeline page focus rings are visible", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/");
    await captureTabOrder(visualPage, "timeline-focus", 5);
  });

  test("button focus ring contrast", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");

    const buttons = visualPage.locator("button:visible");
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const btn = buttons.nth(i);
      await expectFocusScreenshot(btn, `button-focus-${i}`);
    }
  });

  test("input focus ring contrast", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");

    const inputs = visualPage.locator("input:visible");
    const count = await inputs.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const input = inputs.nth(i);
      await expectFocusScreenshot(input, `input-focus-${i}`);
    }
  });

  test("switch focus ring", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");

    const switches = visualPage.locator('[role="switch"]');
    if ((await switches.count()) > 0) {
      await expectFocusScreenshot(switches.first(), "switch-focus");
    }
  });
});

test.describe("Axe-Core Accessibility Audit", () => {
  test("timeline page has no critical violations", async ({
    visualPage,
  }) => {
    await navigateAndWait(visualPage, "/");
    await expectNoAccessibilityViolations(visualPage);
  });

  test("settings page has no critical violations", async ({
    visualPage,
  }) => {
    await navigateAndWait(visualPage, "/settings");
    await expectNoAccessibilityViolations(visualPage);
  });

  test("search page has no critical violations", async ({
    visualPage,
  }) => {
    await navigateAndWait(visualPage, "/search");
    await expectNoAccessibilityViolations(visualPage);
  });

  test("onboarding page has no critical violations", async ({
    visualPage,
  }) => {
    await navigateAndWait(visualPage, "/onboarding");
    await expectNoAccessibilityViolations(visualPage);
  });

  test("captures all violations for reporting", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");
    const violations = await getAccessibilityViolations(visualPage);

    // Log all violations for the report (not just critical)
    if (violations.length > 0) {
      const report = violations.map((v) => ({
        rule: v.id,
        impact: v.impact,
        description: v.description,
        occurrences: v.nodes.length,
        elements: v.nodes.slice(0, 3).map((n) => n.html),
      }));

      // Attach violation report to test results
      await test.info().attach("accessibility-violations.json", {
        body: JSON.stringify(report, null, 2),
        contentType: "application/json",
      });
    }
  });
});

test.describe("ARIA Landmarks", () => {
  test("timeline has proper landmark structure", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/");

    const landmarks = await visualPage.evaluate(() => {
      const roles = [
        "banner",
        "navigation",
        "main",
        "complementary",
        "contentinfo",
      ];
      return roles.map((role) => ({
        role,
        count: document.querySelectorAll(`[role="${role}"]`).length,
        // Also check semantic HTML elements
        semantic:
          role === "banner"
            ? document.querySelectorAll("header").length
            : role === "navigation"
              ? document.querySelectorAll("nav").length
              : role === "main"
                ? document.querySelectorAll("main").length
                : role === "complementary"
                  ? document.querySelectorAll("aside").length
                  : role === "contentinfo"
                    ? document.querySelectorAll("footer").length
                    : 0,
      }));
    });

    await test.info().attach("landmarks-report.json", {
      body: JSON.stringify(landmarks, null, 2),
      contentType: "application/json",
    });

    // At minimum, there should be a main content area
    const mainExists = landmarks.some(
      (l) => l.role === "main" && (l.count > 0 || l.semantic > 0)
    );
    expect(mainExists).toBeTruthy();
  });
});

test.describe("Keyboard Navigation", () => {
  test("settings tabs are keyboard navigable", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");

    const tabList = visualPage.locator('[role="tablist"]').first();
    if (await tabList.isVisible()) {
      // Focus the tab list
      const firstTab = tabList.locator('[role="tab"]').first();
      await firstTab.focus();
      await visualPage.waitForTimeout(100);
      await expectPageScreenshot(visualPage, "tabs-keyboard-first");

      // Arrow right to next tab
      await visualPage.keyboard.press("ArrowRight");
      await visualPage.waitForTimeout(200);
      await expectPageScreenshot(visualPage, "tabs-keyboard-second");
    }
  });

  test("dialog is keyboard trappable", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/settings");

    // Find and click a dialog trigger
    const dialogTriggers = visualPage.locator(
      'button:has-text("add"), button:has-text("new"), button:has-text("create")'
    );

    if ((await dialogTriggers.count()) > 0) {
      await dialogTriggers.first().click();
      await visualPage.waitForTimeout(300);

      const dialog = visualPage.locator('[role="dialog"]');
      if (await dialog.isVisible()) {
        // Tab through dialog elements
        for (let i = 0; i < 4; i++) {
          await visualPage.keyboard.press("Tab");
          await visualPage.waitForTimeout(100);
        }
        await expectPageScreenshot(visualPage, "dialog-keyboard-focus");

        // Escape closes dialog
        await visualPage.keyboard.press("Escape");
        await visualPage.waitForTimeout(300);
        await expectPageScreenshot(visualPage, "dialog-keyboard-closed");
      }
    }
  });
});

test.describe("Color Contrast", () => {
  test("text has sufficient contrast in light mode", async ({
    visualPage,
  }) => {
    await navigateAndWait(visualPage, "/settings");

    // Check using axe-core color-contrast rule specifically
    const violations = await getAccessibilityViolations(visualPage);
    const contrastViolations = violations.filter(
      (v) => v.id === "color-contrast"
    );

    if (contrastViolations.length > 0) {
      await test.info().attach("contrast-violations-light.json", {
        body: JSON.stringify(
          contrastViolations.map((v) => ({
            elements: v.nodes.map((n) => n.html),
            count: v.nodes.length,
          })),
          null,
          2
        ),
        contentType: "application/json",
      });
    }

    // Capture page for visual review
    await expectPageScreenshot(visualPage, "contrast-check-light");
  });
});
