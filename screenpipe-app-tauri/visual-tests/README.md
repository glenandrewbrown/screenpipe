# Visual Regression Testing

Automated visual testing for the screenpipe desktop app using Playwright screenshot comparison.

## Quick Start

```bash
# Run all visual tests (generates baselines on first run)
bun run test:visual

# Update baselines after intentional design changes
bun run test:visual:update

# View HTML report with diff images
bun run test:visual:report

# Interactive UI mode for debugging
bun run test:visual:ui

# Run only desktop Chrome tests
bun run test:visual:chrome

# Run only dark mode tests
bun run test:visual:dark
```

## Directory Structure

```
visual-tests/
+-- components/               # UI component visual tests
|   +-- ui-components.visual.ts
+-- pages/                    # Page layout & responsive tests
|   +-- responsive-layouts.visual.ts
+-- accessibility/            # Accessibility visual tests
|   +-- a11y-visual.visual.ts
+-- utils/                    # Shared helpers & fixtures
|   +-- visual-test-helpers.ts
+-- __snapshots__/            # Baseline screenshots (committed to git)
```

## Test Projects (Browser/Viewport Configurations)

| Project | Browser | Viewport | Theme |
|---------|---------|----------|-------|
| desktop-chrome | Chromium | 1280x720 | light |
| desktop-firefox | Firefox | 1280x720 | light |
| desktop-safari | WebKit | 1280x720 | light |
| mobile-portrait | Chromium | 390x844 | light |
| tablet-landscape | WebKit | 1080x810 | light |
| desktop-wide | Chromium | 1920x1080 | light |
| dark-mode | Chromium | 1280x720 | dark |
| reduced-motion | Chromium | 1280x720 | light |

## Test Categories

### Component Tests (`components/`)
- Button, switch, input, select states
- Hover and focus visual states
- Light/dark mode rendering
- Tab, dialog, tooltip components

### Page Layout Tests (`pages/`)
- Responsive breakpoints (mobile, tablet, desktop, wide)
- Theme switching (light/dark)
- Full page scroll captures
- Horizontal overflow detection
- Navigation consistency across pages

### Accessibility Tests (`accessibility/`)
- Focus ring visibility via Tab navigation
- Axe-core automated audits (critical + serious)
- ARIA landmark structure validation
- Keyboard navigation of tabs, dialogs
- Color contrast analysis

## Workflow

### First Run (Baseline Creation)

```bash
bun run test:visual
```

On first run, all tests will fail because no baselines exist. The screenshots are saved as actual results. Run update to accept them:

```bash
bun run test:visual:update
```

This creates baseline `.png` files in `__snapshots__/`.

### After Design Changes

```bash
# 1. Run tests to see diffs
bun run test:visual

# 2. Open report to review visual diffs
bun run test:visual:report

# 3. If changes are intentional, update baselines
bun run test:visual:update

# 4. Commit updated baselines
git add visual-tests/__snapshots__/
git commit -m "chore: update visual baselines after design change"
```

### CI Integration

Visual tests run on every PR. If diffs are found:
1. CI uploads the HTML report as an artifact
2. Reviewers download and inspect visual diffs
3. If diffs are intentional, run `test:visual:update` locally and push

## Reducing False Positives

The test suite uses several strategies:
- **Animation disabling**: CSS overrides turn off all animations/transitions
- **Dynamic content masking**: Timestamps, counters are masked during comparison
- **Settled rendering**: 300ms wait after navigation before screenshots
- **Network idle**: Waits for all API responses before capturing
- **Consistent environment**: Timezone, locale, color scheme are fixed
- **Single worker**: No parallel execution to avoid resource contention
- **Threshold tolerance**: 0.2 per-pixel threshold, 1% max diff ratio

## Configuration

Visual test config: `playwright-visual.config.ts`

Key settings:
- `snapshotDir`: `./visual-tests/__snapshots__/`
- `outputDir`: `visual-results/` (not committed)
- `reportDir`: `visual-report/` (not committed)
- Animations: disabled globally
- Retries: 3 on CI, 1 locally

## Adding New Visual Tests

1. Create a `.visual.ts` file in the appropriate directory
2. Import from `../utils/visual-test-helpers`
3. Use the `test` fixture (includes `visualPage` with API mocks)
4. Use helper functions: `expectPageScreenshot`, `expectElementScreenshot`, etc.

```typescript
import { test, expectPageScreenshot, navigateAndWait } from "../utils/visual-test-helpers";

test.describe("My Feature", () => {
  test("renders correctly", async ({ visualPage }) => {
    await navigateAndWait(visualPage, "/my-feature");
    await expectPageScreenshot(visualPage, "my-feature-default");
  });
});
```
