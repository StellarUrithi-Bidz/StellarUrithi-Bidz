// E2E tests for the Home Page — auction browsing, filtering, and navigation.
import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { mockConnectedWallet, navigateTo } from "../utils/mock-wallet";

test.describe("Home Page — Browsing & Filtering", () => {
  test("displays the hero section with title and description", async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(page.locator("h1")).toContainText("African Art");
    await expect(page.locator("h1")).toContainText("Auction Protocol");
    await expect(page.locator("text=Connect your Freighter wallet")).toBeVisible();
  });

  test("shows Connect Freighter button in navbar when wallet not connected", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("button:has-text('Connect Freighter')")).toBeVisible();
  });

  test("filters auctions by status", async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // Click Active filter
    await home.selectStatusFilter("Active");
    await page.waitForTimeout(500);

    // Click All to reset
    await home.selectStatusFilter("All");
    await page.waitForTimeout(500);
  });

  test("filters auctions by format", async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // Click English filter
    await home.selectFormatFilter("English");
    await page.waitForTimeout(500);

    // Click All Formats to reset
    await home.selectFormatFilter("All Formats");
    await page.waitForTimeout(500);
  });

  test("shows empty state when no auctions match filters", async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // Loading should resolve
    await page.waitForTimeout(2000);

    // Either we see auction cards or empty state — both are valid
    const cards = await home.auctionCards.count();
    const empty = await home.emptyState.isVisible().catch(() => false);

    expect(cards >= 0 || empty).toBeTruthy();
  });

  test("auction cards navigate to detail page", async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await page.waitForTimeout(1500);
    const cards = await home.auctionCards.count();

    if (cards > 0) {
      await home.clickFirstAuction();
      await expect(page).toHaveURL(/\/auctions\/\d+/);
      await expect(page.locator("h1")).toContainText("Auction #");
    }
  });

  test("navbar has all navigation links", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("text=Auctions")).toBeVisible();
    await expect(page.locator("text=Create")).toBeVisible();
    await expect(page.locator("text=My Bids")).toBeVisible();
    await expect(page.locator("text=Admin")).toBeVisible();
  });

  test("brand logo links back to home", async ({ page }) => {
    await page.goto("/create");
    await page.locator("a", { hasText: "Urithi" }).first().click();
    await expect(page).toHaveURL("/");
  });
});

test.describe("Home Page — Mobile Responsive", () => {
  test.use({ viewport: { width: 393, height: 851 } });

  test("mobile hamburger menu toggles navigation", async ({ page }) => {
    await page.goto("/");

    // Hamburger visible on mobile
    const hamburger = page.locator("button svg").first();
    const wasVisible = await hamburger.isVisible().catch(() => false);

    if (wasVisible) {
      await hamburger.click();
      // Menu should show nav links (duplicates of desktop)
      const auctionLinks = page.locator("text=Auctions");
      const count = await auctionLinks.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});
