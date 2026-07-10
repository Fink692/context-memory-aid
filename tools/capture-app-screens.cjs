const path = require("node:path");

const playwrightPackage = process.env.PLAYWRIGHT_PATH || "playwright";
const { chromium } = require(playwrightPackage);

const baseUrl = process.env.CAPTURE_BASE_URL || "http://127.0.0.1:8081";
const outputDir = process.env.CAPTURE_OUTPUT_DIR || path.resolve("submission/screenshots");
const edgePath = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const shots = [
  ["home", "app-2-home.png", "Walk in already remembering."],
  ["recognize", "app-3-assistant.png", "Who are you about to meet?"],
  ["contact/jordan-patel", "app-4-profile.png", "Jordan Patel"],
  ["memory/jordan-patel", "app-5-memory.png", "What changed with Jordan?"],
  ["settings", "app-6-privacy.png", "Your data"],
];

(async () => {
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/onboarding`, { waitUntil: "networkidle" });
  await page.getByText("Your memory, right when it matters.").waitFor();
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path: path.join(outputDir, "app-1-onboarding.png"), fullPage: false });

  await page.getByLabel("Enable smart memory tools").click();
  await page.getByText("Explore with sample people").click();
  await page.getByText("Walk in already remembering.").waitFor();

  for (const [route, filename, readyText] of shots) {
    await page.goto(`${baseUrl}/${route}`, { waitUntil: "networkidle" });
    await page.getByText(readyText, { exact: true }).first().waitFor();
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outputDir, filename), fullPage: false });
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
