const path = require("node:path");

const playwrightPackage = process.env.PLAYWRIGHT_PATH || "playwright";
const { chromium } = require(playwrightPackage);

const baseUrl = process.env.CAPTURE_BASE_URL || "http://127.0.0.1:4173";
const outputDir = process.env.CAPTURE_OUTPUT_DIR || path.resolve("submission/screenshots");
const edgePath = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const shots = [
  ["onboarding", "app-1-onboarding.png"],
  ["home", "app-2-home.png"],
  ["contact/jordan-patel", "app-3-profile.png"],
  ["memory/jordan-patel", "app-4-memory.png"],
  ["settings", "app-5-privacy.png"],
];

(async () => {
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    // Enable the explicitly consented AI state for judge-facing screenshots.
    // Zustand merges these persisted fields with the seeded contact/event state.
    localStorage.setItem(
      "context-memory-store-v1",
      JSON.stringify({ state: { hasSeenOnboarding: true, aiEnabled: true }, version: 0 }),
    );
  });

  for (const [route, filename] of shots) {
    await page.goto(`${baseUrl}/${route}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outputDir, filename), fullPage: false });
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
