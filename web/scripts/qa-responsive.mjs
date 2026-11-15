import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const outputDir = process.argv[3] ?? "qa-shots/responsive";
const requested = new Set((process.argv[4] ?? "phone,tablet,desktop").split(","));
mkdirSync(outputDir, { recursive: true });
const profiles = [
  ["phone", devices["iPhone 13"]],
  ["tablet", devices["iPad (gen 7)"]],
  ["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
].filter(([name]) => requested.has(name));

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const failures = [];

for (const [name, profile] of profiles) {
  const context = await browser.newContext(profile);
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto(`${baseUrl}/?review=1&quality=medium&probe=1`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector("canvas", { state: "visible", timeout: 120_000 });
  await page.waitForSelector('[data-hud="turn"]', { state: "visible", timeout: 120_000 });
  await page.waitForTimeout(4_000);

  const result = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const rect = canvas?.getBoundingClientRect();
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    const visibleButtons = [...document.querySelectorAll("button")].filter((button) => {
      const box = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    const rootStyle = getComputedStyle(document.body);
    return {
      viewport: [innerWidth, innerHeight],
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      canvas: rect ? [Math.round(rect.width), Math.round(rect.height)] : null,
      webgl: Boolean(gl) && !gl.isContextLost(),
      battleBounds: window.__kg?.battleBounds?.() ?? null,
      hudWidths: Object.fromEntries(["turn", "primary-actions"].map((region) => [
        region,
        document.querySelector(`[data-hud="${region}"]`)?.getBoundingClientRect().width ?? null,
      ])),
      directActions: visibleButtons
        .filter((button) => button.closest('[data-hud="primary-actions"]'))
        .map((button) => button.getAttribute("aria-label")),
      visibleButtons: visibleButtons.length,
      smallestTouchTarget: visibleButtons.length
        ? Math.min(...visibleButtons.map((button) => {
            const box = button.getBoundingClientRect();
            return Math.min(box.width, box.height);
          }))
        : 0,
      background: rootStyle.backgroundColor,
      text: rootStyle.color,
    };
  });

  const problems = [];
  if (result.horizontalOverflow > 1) problems.push(`horizontal overflow ${result.horizontalOverflow}px`);
  if (!result.webgl) problems.push("WebGL context missing or lost");
  if (!result.canvas || result.canvas[0] < result.viewport[0] * 0.9 || result.canvas[1] < result.viewport[1] * 0.9) {
    problems.push(`canvas does not cover viewport (${result.canvas?.join("x") ?? "missing"})`);
  }
  if (result.visibleButtons < 3) problems.push(`only ${result.visibleButtons} visible controls`);
  const bounds = result.battleBounds;
  if (!bounds || !bounds.inFront || ![bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)) {
    problems.push("projected battle bounds missing or behind camera");
  } else if (bounds.left < 0 || bounds.right > result.viewport[0] || bounds.top < 0 || bounds.bottom > result.viewport[1]) {
    problems.push(`board or standing armies clipped: ${JSON.stringify(bounds)}`);
  }
  if (bounds?.pieces !== 32) problems.push(`initial armies incomplete (${bounds?.pieces ?? "missing"} figures)`);
  if (bounds?.hallOcclusions !== 0) problems.push(`hall obscures ${bounds?.hallOcclusions ?? "unknown"} figures`);
  if (name === "phone") {
    for (const [region, width] of Object.entries(result.hudWidths)) {
      if (width === null || width > result.viewport[0] * 0.38) {
        problems.push(`${region} exceeds 38% viewport width (${width ?? "missing"}px)`);
      }
    }
    if (result.smallestTouchTarget < 44) problems.push(`touch target below 44px (${result.smallestTouchTarget}px)`);
    if (JSON.stringify(result.directActions) !== JSON.stringify(["Undo", "Resign", "More"]) || result.visibleButtons !== 3) {
      problems.push(`expected only Undo, Resign, More; got ${result.directActions.join(", ")} / ${result.visibleButtons} total`);
    }
  }

  await page.screenshot({
    path: `${outputDir}/${name}.png`,
    fullPage: true,
    animations: "disabled",
    timeout: 180_000,
  });
  if (name === "phone") {
    await page.getByRole("button", { name: "More", exact: true }).click();
    const menu = page.locator('[data-hud="secondary-actions"]');
    await menu.waitFor({ state: "visible" });
    for (const label of ["Fullscreen", "Settings", "Mute", "Tactical 2D", "Flip 180°", "Chronicle", "New game"]) {
      if (await menu.getByRole("button", { name: label, exact: true }).count() !== 1) {
        problems.push(`secondary action unavailable: ${label}`);
      }
    }
    const menuTargets = await menu.locator("button").evaluateAll((buttons) => buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return Math.min(box.width, box.height);
    }));
    if (Math.min(...menuTargets) < 44) problems.push("secondary menu target below 44px");
    await page.screenshot({ path: `${outputDir}/phone-menu.png`, animations: "disabled", timeout: 180_000 });
    await page.keyboard.press("Escape");
    if (await menu.count()) problems.push("secondary menu did not dismiss on Escape");
  }
  if (runtimeErrors.length) problems.push(`runtime errors: ${runtimeErrors.slice(0, 3).join(" | ")}`);
  console.log(`${name}: ${problems.length ? "FAIL" : "PASS"}`, JSON.stringify(result));
  failures.push(...problems.map((problem) => `${name}: ${problem}`));
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
