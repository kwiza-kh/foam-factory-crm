import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(process.env.LOCALAPPDATA, "npm-cache", "_npx", "702923228c2ce1e6", "node_modules", "hyperframes", "package.json"));
const puppeteer = require("puppeteer-core");
const projectRoot = dirname(fileURLToPath(import.meta.url));
const captureDir = join(projectRoot, "capture");
const screenshotsDir = join(captureDir, "screenshots");
const extractedDir = join(captureDir, "extracted");
const assetsDir = join(captureDir, "assets");
const chromePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1223", "chrome-win64", "chrome.exe");

await mkdir(screenshotsDir, { recursive: true });
await mkdir(extractedDir, { recursive: true });
await mkdir(assetsDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  args: [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--font-render-hinting=none",
  ],
});

const page = await browser.newPage();
page.setDefaultTimeout(30000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".app-shell", { timeout: 30000 });
await page.waitForFunction(() => document.querySelectorAll(".ag-row, .dashboard-order-row, .customer-item").length > 0, { timeout: 30000 });

async function screenshot(name) {
  await page.screenshot({ path: join(screenshotsDir, name), fullPage: false });
}

await screenshot("scroll-000-dashboard.png");

const tabs = await page.$$eval(".tab-button", (buttons) => buttons.map((button) => button.textContent?.trim()).filter(Boolean));
const tabClicks = [
  ["orders-grid.png", /订单|Order/i],
  ["production-kanban.png", /排产|Production|Kanban/i],
  ["deliveries-grid.png", /送货单$|Delivery/i],
  ["statistics-panel.png", /对账|Statement|统计|Statistics/i],
];

for (const [fileName, pattern] of tabClicks) {
  const clicked = await page.evaluate((source) => {
    const pattern = new RegExp(source, "i");
    const button = Array.from(document.querySelectorAll(".tab-button")).find((node) => pattern.test(node.textContent || ""));
    if (!button) return false;
    button.click();
    return true;
  }, pattern.source);
  if (clicked) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await screenshot(fileName);
  }
}

const extracted = await page.evaluate((capturedTabs) => {
  const css = getComputedStyle(document.documentElement);
  const vars = [
    "--bg",
    "--panel",
    "--panel-strong",
    "--panel-elevated",
    "--line",
    "--line-strong",
    "--text",
    "--text-secondary",
    "--muted",
    "--accent",
    "--accent-hover",
    "--accent-press",
    "--red",
    "--amber",
    "--green",
  ];
  const colors = vars.map((name) => ({ name, value: css.getPropertyValue(name).trim() })).filter((item) => item.value);
  const fontFamily = css.fontFamily;
  const textLines = Array.from(document.querySelectorAll("h1,h2,h3,h4,p,button,span,strong,small,th,td,label,a"))
    .map((node) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 140) return null;
      return `[${node.tagName.toLowerCase()}] ${text}`;
    })
    .filter(Boolean);
  const counts = {
    sections: document.querySelectorAll("section,.dashboard-section,.table-section,.customer-panel,.metric-card").length,
    headings: document.querySelectorAll("h1,h2,h3,h4").length,
    ctas: document.querySelectorAll("button,.primary-action,.secondary-button,.ghost-button").length,
    rows: document.querySelectorAll(".ag-row,.dashboard-order-row").length,
    customerItems: document.querySelectorAll(".customer-item").length,
  };
  const labels = Array.from(new Set([
    ...Array.from(document.querySelectorAll(".tab-button")).map((node) => node.textContent?.trim()),
    ...Array.from(document.querySelectorAll(".status-chip")).map((node) => node.textContent?.trim()),
  ].filter(Boolean)));
  return { colors, fontFamily, textLines, counts, labels, tabs: capturedTabs };
}, tabs);

await writeFile(join(extractedDir, "tokens.json"), JSON.stringify({
  colors: extracted.colors,
  fonts: [{ family: extracted.fontFamily, source: "CSS :root" }],
  counts: extracted.counts,
  tabs: extracted.tabs,
  labels: extracted.labels,
}, null, 2), "utf8");

await writeFile(join(extractedDir, "visible-text.txt"), extracted.textLines.join("\n"), "utf8");
await writeFile(join(extractedDir, "asset-descriptions.md"), [
  "# Asset Descriptions",
  "",
  "- `scroll-000-dashboard.png` - full 1920x1080 capture of the CRM workspace: dark sidebar, live dashboard/order area, cyan accent controls.",
  "- `orders-grid.png` - AG Grid order-management screen with dense columns, status chips, toolbar actions, and customer context.",
  "- `production-kanban.png` - production/order workflow tab capture, showing planning/status workflow if available.",
  "- `deliveries-grid.png` - delivery-note tracking grid capture, showing dispatch rows and final delivery state if available.",
  "- `statistics-panel.png` - accounting/statement or statistics workflow capture if the tab is available.",
  "- `public/favicon.svg` - app favicon and compact brand mark from the source app.",
  "",
].join("\n"), "utf8");
await writeFile(join(captureDir, "AGENTS.md"), "Captured manually with Puppeteer because `hyperframes capture` produced empty extraction folders for this data-heavy local CRM.\n", "utf8");

await browser.close();
console.log(JSON.stringify({
  screenshots: ["scroll-000-dashboard.png", "orders-grid.png", "production-kanban.png", "deliveries-grid.png", "statistics-panel.png"],
  colors: extracted.colors.length,
  textLines: extracted.textLines.length,
  counts: extracted.counts,
}, null, 2));
