// E2E tests for the Create Auction 3-step wizard.
import { test, expect } from "@playwright/test";
import { CreateAuctionPage } from "../pages/CreateAuctionPage";
import { mockConnectedWallet } from "../utils/mock-wallet";

test.describe("Create Auction — Wallet Gating", () => {
  test("shows connect prompt when wallet not connected", async ({ page }) => {
    const create = new CreateAuctionPage(page);
    await create.goto();

    await expect(page.locator("text=Connect Your Wallet")).toBeVisible();
    await expect(page.locator("text=Connect Freighter to create an auction listing.")).toBeVisible();
    await expect(page.locator("button:has-text('Connect Freighter')")).toBeVisible();
  });
});

test.describe("Create Auction — 3-Step Wizard", () => {
  test.beforeEach(async ({ page }) => {
    await mockConnectedWallet(page);
    const create = new CreateAuctionPage(page);
    await create.goto();
  });

  test("Step 1: displays all three auction format options", async ({ page }) => {
    await expect(page.locator("text=Choose Auction Format")).toBeVisible();
    await expect(page.locator("text=English (Ascending)")).toBeVisible();
    await expect(page.locator("text=Dutch (Descending)")).toBeVisible();
    await expect(page.locator("text=Sealed-Bid (Commit-Reveal)")).toBeVisible();
  });

  test("Step 1: English format is selected by default", async ({ page }) => {
    const englishBtn = page.locator("button").filter({ hasText: "English (Ascending)" });
    await expect(englishBtn).toHaveClass(/text-ochre-400/);
  });

  test("Step 1: can select Dutch format and navigate to Step 2", async ({ page }) => {
    const create = new CreateAuctionPage(page);

    await create.selectFormat("Dutch");
    await create.goToStep2();

    await expect(page.locator("text=Auction Details")).toBeVisible();
    await expect(page.locator("text=Start Price (stroops)")).toBeVisible();
    await expect(page.locator("text=Price Decay Rate (stroops/second)")).toBeVisible();
  });

  test("Step 1: can select Sealed-Bid and see commit duration field", async ({ page }) => {
    const create = new CreateAuctionPage(page);

    await create.selectFormat("Sealed-Bid");
    await create.goToStep2();

    await expect(page.locator("text=Commit Phase Duration (hours)")).toBeVisible();
  });

  test("Step 1: can select Physical item type and see custodian field", async ({ page }) => {
    const create = new CreateAuctionPage(page);

    await create.selectItemType("Physical");
    await create.goToStep2();

    await expect(page.locator("text=Custodian Address")).toBeVisible();
  });

  test("Step 2: can fill all English auction form fields", async ({ page }) => {
    const create = new CreateAuctionPage(page);

    // Step 1
    await create.goToStep2();

    // Step 2 — fill fields
    await create.fillReservePrice("1000000000");
    await create.fillRoyalty("500");
    await create.fillDuration("24");
    await create.fillCreatorAddress("GCREATOR1234567890ABCDEF1234567890AB");

    // Verify royalty percentage display
    await expect(page.locator("text=5%")).toBeVisible();
  });

  test("Step 2: can navigate back to Step 1", async ({ page }) => {
    const create = new CreateAuctionPage(page);

    await create.goToStep2();
    await expect(page.locator("text=Auction Details")).toBeVisible();

    await create.backButton.click();
    await expect(page.locator("text=Choose Auction Format")).toBeVisible();
  });

  test("Step 3: shows IPFS upload sections and summary", async ({ page }) => {
    const create = new CreateAuctionPage(page);

    // Navigate to Step 3
    await create.goToStep2();
    await create.goToStep3();

    await expect(page.locator("text=Item Images & Metadata")).toBeVisible();
    await expect(page.locator("text=Upload Item Image")).toBeVisible();
    await expect(page.locator("text=Item Metadata")).toBeVisible();
    await expect(page.locator("text=Summary")).toBeVisible();
  });

  test("Step 3: Create Auction button is disabled until metadata uploaded", async ({ page }) => {
    const create = new CreateAuctionPage(page);

    await create.goToStep2();
    await create.goToStep3();

    const submitBtn = create.submitButton;
    await expect(submitBtn).toBeDisabled();
  });

  test("Step 3: summary shows correct format and item type", async ({ page }) => {
    const create = new CreateAuctionPage(page);

    await create.goToStep2();
    await create.goToStep3();

    // Summary should show format (english) and item type (Digital)
    await expect(page.locator("text=english")).toBeVisible();
    await expect(page.locator("text=Digital").first()).toBeVisible();
  });

  test("progress steps show correct active state", async ({ page }) => {
    const create = new CreateAuctionPage(page);

    // Step 1: step "1" should be highlighted
    const steps = create.stepIndicators;
    await expect(steps.nth(0)).toHaveClass(/bg-ochre-500/);

    // Step 2
    await create.goToStep2();
    await expect(steps.nth(1)).toHaveClass(/bg-ochre-500/);

    // Step 3
    await create.goToStep3();
    await expect(steps.nth(2)).toHaveClass(/bg-ochre-500/);
  });
});
