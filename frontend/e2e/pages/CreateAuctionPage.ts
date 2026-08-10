// Page Object Model for the Create Auction page (3-step wizard).
import { Page, Locator } from "@playwright/test";

export class CreateAuctionPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly stepIndicators: Locator;
  readonly formatOptions: Locator;
  readonly continueButton: Locator;
  readonly backButton: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator("h1");
    this.stepIndicators = page.locator('[class*="rounded-full"]');
    this.formatOptions = page.locator("button").filter({ hasText: /^(English|Dutch|Sealed-Bid)/ });
    this.continueButton = page.locator("button").filter({ hasText: "Continue →" });
    this.backButton = page.locator("button").filter({ hasText: "← Back" });
    this.submitButton = page.locator("button").filter({ hasText: "Create Auction" }).last();
  }

  async goto(): Promise<void> {
    await this.page.goto("/create");
    await this.page.waitForLoadState("networkidle");
  }

  // Step 1: Format selection
  async selectFormat(format: "English" | "Dutch" | "Sealed-Bid"): Promise<void> {
    await this.formatOptions.filter({ hasText: format }).first().click();
  }

  async selectItemType(type: "Digital" | "Physical"): Promise<void> {
    await this.page.locator("button").filter({ hasText: type }).first().click();
  }

  async goToStep2(): Promise<void> {
    await this.continueButton.click();
  }

  // Step 2: Auction details
  async fillReservePrice(price: string): Promise<void> {
    const label = this.page.locator("label").filter({ hasText: "Reserve Price" });
    const input = label.locator("..").locator("input");
    await input.fill(price);
  }

  async fillRoyalty(bps: string): Promise<void> {
    const label = this.page.locator("label").filter({ hasText: "Creator Royalty" });
    const input = label.locator("..").locator("input");
    await input.fill(bps);
  }

  async fillDuration(hours: string): Promise<void> {
    const label = this.page.locator("label").filter({ hasText: "Auction Duration" });
    const input = label.locator("..").locator("input");
    await input.fill(hours);
  }

  async fillCreatorAddress(address: string): Promise<void> {
    const label = this.page.locator("label").filter({ hasText: "Original Creator" });
    const input = label.locator("..").locator("input");
    await input.fill(address);
  }

  async goToStep3(): Promise<void> {
    await this.continueButton.click();
  }

  // Step 3: IPFS + metadata
  async fillMetadataName(name: string): Promise<void> {
    const input = this.page.locator("input").filter({ hasText: "" }).locator('[placeholder*="Yoruba"]').first();
    if (await input.count() === 0) {
      // Fallback: find by general label
      const label = this.page.locator("label").filter({ hasText: "Item Name" });
      const inp = label.locator("..").locator("input");
      await inp.fill(name);
    } else {
      await input.fill(name);
    }
  }

  async submitAuction(): Promise<void> {
    await this.submitButton.click();
  }
}
