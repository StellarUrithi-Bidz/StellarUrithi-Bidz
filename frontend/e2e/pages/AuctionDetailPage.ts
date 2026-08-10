// Page Object Model for the Auction Detail page.
import { Page, Locator } from "@playwright/test";

export class AuctionDetailPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly currentBid: Locator;
  readonly timeRemaining: Locator;
  readonly bidInput: Locator;
  readonly placeBidButton: Locator;
  readonly buyNowButton: Locator;
  readonly bidHistory: Locator;
  readonly settlementBreakdown: Locator;
  readonly breadcrumb: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator("h1");
    this.statusBadge = page.locator('[class*="rounded-lg"][class*="text-"]').first();
    this.currentBid = page.locator("text=Current Bid").locator("..");
    this.timeRemaining = page.locator("text=Time Remaining").locator("..");
    this.bidInput = page.locator('input[placeholder*="bid amount"]');
    this.placeBidButton = page.locator("button").filter({ hasText: /^(Place Bid|Commit Sealed Bid)$/ });
    this.buyNowButton = page.locator("button").filter({ hasText: "Buy Now" });
    this.bidHistory = page.locator("text=Bid History").locator("..");
    this.settlementBreakdown = page.locator("text=Settlement Breakdown").locator("..");
    this.breadcrumb = page.locator("text=Back to Auctions");
  }

  async goto(auctionId: number = 42): Promise<void> {
    await this.page.goto(`/auctions/${auctionId}`);
    await this.page.waitForLoadState("networkidle");
  }

  async getAuctionId(): Promise<string> {
    const text = await this.heading.textContent();
    return text?.replace("Auction #", "") || "";
  }

  async getStatus(): Promise<string> {
    return (await this.statusBadge.textContent()) || "";
  }

  async enterBidAmount(amount: string): Promise<void> {
    await this.bidInput.fill(amount);
  }

  async clickPlaceBid(): Promise<void> {
    await this.placeBidButton.click();
  }

  async clickBuyNow(): Promise<void> {
    await this.buyNowButton.click();
  }

  async getBidHistoryCount(): Promise<number> {
    return await this.bidHistory.locator('[class*="rounded-xl"]').count();
  }

  async clickBreadcrumb(): Promise<void> {
    await this.breadcrumb.click();
    await this.page.waitForLoadState("networkidle");
  }
}
