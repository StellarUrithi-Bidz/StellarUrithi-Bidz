// Mock Freighter wallet state for E2E Playwright tests.
// Injects a simulated wallet into the browser context so tests can
// exercise the full user flow without a real Freighter extension.

import { Page } from "@playwright/test";

export interface MockWalletState {
  address: string;
  isConnected: boolean;
  isConnecting: boolean;
}

const DEFAULT_ADDRESS = "GABCDEF1234567890ABCDEF1234567890ABCDEF";
const DEFAULT_CREATOR = "GCREATOR1234567890ABCDEF1234567890AB";
const DEFAULT_CUSTODIAN = "GCUSTODIAN1234567890ABCDEF12345678";

/**
 * Inject a mock Freighter wallet into the page context.
 * This simulates a connected wallet so tests can interact with
 * wallet-gated pages (create auction, place bid, etc.).
 */
export async function mockConnectedWallet(
  page: Page,
  options: Partial<MockWalletState> = {}
): Promise<void> {
  const state: MockWalletState = {
    address: options.address || DEFAULT_ADDRESS,
    isConnected: options.isConnected ?? true,
    isConnecting: options.isConnecting ?? false,
  };

  await page.addInitScript((walletState) => {
    // Mock window.freighter for contract signing
    (window as any).freighter = {
      signTransaction: async (xdr: string) => ({
        signedTxXdr: `mock-signed-${xdr.slice(0, 8)}`,
      }),
      signMessage: async (message: string) => {
        // Return a mock base64 signature (browser-compatible)
        const sig = `mock-signature-${message.slice(0, 20)}`;
        return btoa(sig);
      },
    };

    // Mock @stellar/freighter-api module responses
    // This is set up as a global that the WalletProvider reads
    (window as any).__mockFreighterState = {
      address: walletState.address,
      isConnected: walletState.isConnected,
      isConnecting: walletState.isConnecting,
    };
  }, state);
}

/**
 * Navigate to a page and wait for it to be ready.
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/**
 * Wait for toast notification to appear and dismiss.
 */
export async function waitForToast(
  page: Page,
  text?: string
): Promise<void> {
  const toast = text
    ? page.locator(`[role="status"]:has-text("${text}")`)
    : page.locator('[role="status"]');
  await toast.waitFor({ state: "visible", timeout: 5000 }).catch(() => {
    // Toast may not appear in all test scenarios
  });
}

/**
 * Check that a page has the expected title.
 */
export async function expectPageTitle(page: Page, title: string): Promise<void> {
  await page.waitForSelector(`h1:has-text("${title}")`, { timeout: 5000 });
}

/**
 * Fill an input field by its label text.
 */
export async function fillByLabel(
  page: Page,
  labelText: string,
  value: string
): Promise<void> {
  const label = page.locator("label").filter({ hasText: labelText });
  const input = label.locator("..").locator("input, textarea");
  await input.fill(value);
}

/**
 * Click a button by its visible text.
 */
export async function clickButton(
  page: Page,
  text: string
): Promise<void> {
  await page.locator("button").filter({ hasText: text }).first().click();
}

export { DEFAULT_ADDRESS, DEFAULT_CREATOR, DEFAULT_CUSTODIAN };
