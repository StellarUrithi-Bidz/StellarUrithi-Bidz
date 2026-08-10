// Page Object Model for the Home Page (auction listings).
import { Page, Locator } from "@playwright/test";

export class HomePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly auctionCards: Locator;
  readonly statusFilter: Locator;
  readonly formatFilter: Locator;
  readonly emptyState: Locator;
  readonly loader: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator("h1");
    this.auctionCards = page.locator('[class*="glass-card"] a');
    this.statusFilter = page.locator("button").filter({ hasText: /^(Active|Ended|Settled|All)$/ });
    this.formatFilter = page.locator("button").filter({ hasText: /^(English|Dutch|Sealed-Bid|All Formats)$/ });
    this.emptyState = page.locator("text=No auctions found");
    this.loader = page.locator(".animate-spin");
  }

  async goto(): Promise<void> {
    await this.page.goto("/");
    await this.page.waitForLoadState("networkidle");
  }

  async selectStatusFilter(status: string): Promise<void> {
    await this.statusFilter.filter({ hasText: status }).click();
  }

  async selectFormatFilter(format: string): Promise<void> {
    await this.formatFilter.filter({ hasText: format }).click();
  }

  async clickFirstAuction(): Promise<void> {
    await this.auctionCards.first().click();
    await this.page.waitForLoadState("networkidle");
  }

  async getAuctionCount(): Promise<number> {
    return await this.auctionCards.count();
  }
}
