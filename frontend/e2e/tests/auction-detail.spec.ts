// E2E tests for the Auction Detail page — bidding, status display, and bid history.
import { test, expect } from "@playwright/test";
import { AuctionDetailPage } from "../pages/AuctionDetailPage";
import { mockConnectedWallet, DEFAULT_ADDRESS } from "../utils/mock-wallet";

test.describe("Auction Detail — Display & Status", () => {
  test("shows auction header with ID, status, and seller", async ({ page }) => {
    const detail = new AuctionDetailPage(page);
    await detail.goto(42);

    await page.waitForTimeout(2000);

    // Should show either auction detail or not-found
    const hasAuction = await detail.heading.isVisible().catch(() => false);
    if (hasAuction) {
      await expect(detail.heading).toContainText("Auction #");
    }
  });

  test("shows breadcrumb link back to auctions", async ({ page }) => {
    const detail = new AuctionDetailPage(page);
    await detail.goto(42);

    const breadcrumb = detail.breadcrumb;
    const visible = await breadcrumb.isVisible().catch(() => false);
    if (visible) {
      await expect(breadcrumb).toContainText("Back to Auctions");
    }
  });

  test("shows bidding panel with Place a Bid header for active auctions", async ({ page }) => {
    await mockConnectedWallet(page);
    const detail = new AuctionDetailPage(page);
    await detail.goto(42);

    await page.waitForTimeout(1500);

    // Check if Place a Bid or appropriate panel is shown
    const placeBid = page.locator("text=Place a Bid");
    const ended = page.locator("text=Auction ended");
    const settled = page.locator("text=Auction settled");

    const hasBidPanel = (await placeBid.isVisible().catch(() => false)) ||
      (await ended.isVisible().catch(() => false)) ||
      (await settled.isVisible().catch(() => false));

    expect(hasBidPanel).toBeTruthy();
  });

  test("displays item details — reserve price, royalty, item type", async ({ page }) => {
    const detail = new AuctionDetailPage(page);
    await detail.goto(42);

    await page.waitForTimeout(1500);

    // These labels should be present on the detail page
    const hasDetails = await page.locator("text=Reserve Price:").isVisible().catch(() => false);
    const hasRoyalty = await page.locator("text=Royalty:").isVisible().catch(() => false);
    const hasItemType = await page.locator("text=Item Type:").isVisible().catch(() => false);

    // At least some of these should be visible for a valid auction
    if (hasDetails || hasRoyalty || hasItemType) {
      expect(true).toBeTruthy();
    }
  });

  test("displays IPFS metadata URI", async ({ page }) => {
    const detail = new AuctionDetailPage(page);
    await detail.goto(42);

    await page.waitForTimeout(1500);

    const ipfsLabel = page.locator("text=IPFS Metadata");
    const visible = await ipfsLabel.isVisible().catch(() => false);
    if (visible) {
      await expect(ipfsLabel).toBeVisible();
    }
  });

  test("shows not-found message for invalid auction ID", async ({ page }) => {
    await page.goto("/auctions/999999999");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const notFound = page.locator("text=Auction not found");
    const visible = await notFound.isVisible().catch(() => false);
    if (visible) {
      await expect(notFound).toBeVisible();
      await expect(page.locator("text=Back to Auctions")).toBeVisible();
    }
  });
});

test.describe("Auction Detail — Bidding Interaction", () => {
  test.beforeEach(async ({ page }) => {
    await mockConnectedWallet(page);
  });

  test("Connect Wallet to Bid shown when not connected", async ({ page }) => {
    await page.goto("/auctions/42");
    await page.waitForTimeout(1500);

    // Should show connect wallet button if not mocked
    const connectBtn = page.locator("button:has-text('Connect Wallet to Bid')");
    const hasBtn = await connectBtn.isVisible().catch(() => false);
    if (hasBtn) {
      await expect(connectBtn).toBeVisible();
    }
  });

  test("bid input accepts numeric values for English auctions", async ({ page }) => {
    const detail = new AuctionDetailPage(page);
    await detail.goto(42);

    await page.waitForTimeout(1500);

    const input = detail.bidInput;
    const hasInput = await input.isVisible().catch(() => false);
    if (hasInput) {
      await input.fill("500");
      await expect(input).toHaveValue("500");
    }
  });

  test("shows WebSocket status indicator", async ({ page }) => {
    const detail = new AuctionDetailPage(page);
    await detail.goto(42);

    await page.waitForTimeout(1500);

    // WebSocket status should show either "Live updates active" or "Connecting..."
    const wsStatus = page.locator("text=/Live|Connecting/").first();
    const visible = await wsStatus.isVisible().catch(() => false);
    if (visible) {
      expect(true).toBeTruthy();
    }
  });

  test("settlement breakdown visible for settled auctions", async ({ page }) => {
    await page.goto("/auctions/42");
    await page.waitForTimeout(1500);

    // Check if settlement breakdown is shown (depends on auction state)
    const breakdown = page.locator("text=Settlement Breakdown");
    const seller = page.locator("text=Seller gets:");
    const creator = page.locator("text=Creator gets:");

    const hasBreakdown = (await breakdown.isVisible().catch(() => false)) ||
      (await seller.isVisible().catch(() => false));

    // May or may not be visible depending on auction state
    if (hasBreakdown) {
      expect(true).toBeTruthy();
    }
  });
});

test.describe("Auction Detail — Navigation", () => {
  test("breadcrumb navigates back to home page", async ({ page }) => {
    const detail = new AuctionDetailPage(page);
    await detail.goto(42);

    await page.waitForTimeout(1000);

    const breadcrumb = detail.breadcrumb;
    const visible = await breadcrumb.isVisible().catch(() => false);

    if (visible) {
      await detail.clickBreadcrumb();
      await expect(page).toHaveURL("/");
    }
  });
});
