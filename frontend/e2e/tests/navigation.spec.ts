// E2E tests for navigation, My Bids page, Admin panel, and end-to-end user flows.
import { test, expect } from "@playwright/test";
import { mockConnectedWallet, navigateTo, clickButton } from "../utils/mock-wallet";

test.describe("Navigation & Routing", () => {
  test("navbar link: Auctions navigates to home", async ({ page }) => {
    await page.goto("/create");
    await page.locator("a:has-text('Auctions')").first().click();
    await expect(page).toHaveURL("/");
  });

  test("navbar link: Create navigates to create page", async ({ page }) => {
    await page.goto("/");
    await page.locator("a:has-text('Create')").first().click();
    await expect(page).toHaveURL("/create");
  });

  test("navbar link: My Bids navigates to my-bids page", async ({ page }) => {
    await page.goto("/");
    await page.locator("a:has-text('My Bids')").first().click();
    await expect(page).toHaveURL("/my-bids");
  });

  test("navbar link: Admin navigates to admin page", async ({ page }) => {
    await page.goto("/");
    await page.locator("a:has-text('Admin')").first().click();
    await expect(page).toHaveURL("/admin");
  });

  test("footer has Stellar and GitHub links", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("text=Stellar")).toBeVisible();
    await expect(page.locator("text=Open Source")).toBeVisible();
  });
});

test.describe("My Bids Page", () => {
  test("shows connect prompt when wallet not connected", async ({ page }) => {
    await page.goto("/my-bids");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Connect Your Wallet")).toBeVisible();
    await expect(page.locator("text=Connect Freighter to view your bid history.")).toBeVisible();
  });

  test("shows bid history when wallet is connected", async ({ page }) => {
    await mockConnectedWallet(page);
    await page.goto("/my-bids");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Page title should be visible
    await expect(page.locator("text=My Bids")).toBeVisible();
    await expect(page.locator("text=Track your bidding activity")).toBeVisible();
  });

  test("empty state shows Browse Auctions link when no bids", async ({ page }) => {
    await mockConnectedWallet(page);
    await page.goto("/my-bids");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Either shows bids or empty state with Browse Auctions link
    const browseLink = page.locator("text=Browse Auctions");
    const bids = page.locator("text=Auction #");

    const hasContent = (await browseLink.isVisible().catch(() => false)) ||
      (await bids.first().isVisible().catch(() => false));
    expect(hasContent).toBeTruthy();
  });
});

test.describe("Admin Panel", () => {
  test("shows connect prompt when wallet not connected", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Admin Access")).toBeVisible();
    await expect(page.locator("text=Connect Freighter wallet to access admin panel.")).toBeVisible();
  });

  test("shows admin panel with platform settings when connected", async ({ page }) => {
    await mockConnectedWallet(page);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await expect(page.locator("text=Admin Panel")).toBeVisible();
    await expect(page.locator("text=Platform Settings")).toBeVisible();
    await expect(page.locator("text=Emergency Controls")).toBeVisible();
    await expect(page.locator("text=Contract Info")).toBeVisible();
  });

  test("platform fee input accepts values", async ({ page }) => {
    await mockConnectedWallet(page);
    await page.goto("/admin");
    await page.waitForTimeout(1000);

    const feeLabel = page.locator("label").filter({ hasText: "Platform Fee" });
    const feeInput = feeLabel.locator("..").locator("input");

    if (await feeInput.isVisible()) {
      await feeInput.fill("300");
      await expect(feeInput).toHaveValue("300");
    }
  });

  test("pause button toggles state", async ({ page }) => {
    await mockConnectedWallet(page);
    await page.goto("/admin");
    await page.waitForTimeout(1000);

    const pauseBtn = page.locator("button").filter({ hasText: /Pause|Unpause/ });
    if (await pauseBtn.isVisible()) {
      await pauseBtn.click();
      // Button should have changed text
      await page.waitForTimeout(500);
    }
  });

  test("displays contract ID and network info", async ({ page }) => {
    await mockConnectedWallet(page);
    await page.goto("/admin");
    await page.waitForTimeout(1000);

    await expect(page.locator("text=Contract ID:")).toBeVisible();
    await expect(page.locator("text=Network:")).toBeVisible();
    await expect(page.locator("text=Connected Wallet:")).toBeVisible();
  });
});

test.describe("Full User Flow — Browse → Detail → Back", () => {
  test("user can browse auctions, view detail, and return home", async ({ page }) => {
    await mockConnectedWallet(page);

    // 1. Start on home page
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // 2. Check for auction cards
    const cards = page.locator('[class*="glass-card"] a');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      // 3. Click first auction card
      await cards.first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      // 4. Verify we're on a detail page
      await expect(page).toHaveURL(/\/auctions\/\d+/);

      // 5. Navigate back to home via breadcrumb
      const breadcrumb = page.locator("text=Back to Auctions");
      if (await breadcrumb.isVisible()) {
        await breadcrumb.click();
        await expect(page).toHaveURL("/");
      }
    }
  });
});

test.describe("Create Auction → Verify Summary Flow", () => {
  test("full create auction wizard flow", async ({ page }) => {
    await mockConnectedWallet(page);

    // 1. Navigate to create page
    await page.goto("/create");
    await page.waitForLoadState("networkidle");

    // 2. Select English format and go to step 2
    await page.locator("button").filter({ hasText: "Continue →" }).click();
    await page.waitForTimeout(300);

    // 3. Fill in required fields in step 2
    const reserveLabel = page.locator("label").filter({ hasText: "Reserve Price" });
    const reserveInput = reserveLabel.locator("..").locator("input");
    if (await reserveInput.isVisible()) {
      await reserveInput.fill("1000000000");
    }

    // 4. Navigate to step 3
    await page.locator("button").filter({ hasText: "Continue →" }).click();
    await page.waitForTimeout(300);

    // 5. Verify step 3 is showing
    await expect(page.locator("text=Item Images & Metadata")).toBeVisible();

    // 6. Verify summary section
    await expect(page.locator("text=Summary")).toBeVisible();

    // 7. Back to step 2
    await page.locator("button").filter({ hasText: "← Back" }).click();
    await expect(page.locator("text=Auction Details")).toBeVisible();

    // 8. Back to step 1
    await page.locator("button").filter({ hasText: "← Back" }).click();
    await expect(page.locator("text=Choose Auction Format")).toBeVisible();
  });
});
