import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const ROOT = resolve(process.cwd(), "dist");
const PORT = 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".hdr": "application/octet-stream",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let file = join(ROOT, decodeURIComponent(url.pathname));
    try {
      const info = await stat(file);
      if (info.isDirectory()) file = join(file, "index.html");
    } catch {
      file = join(ROOT, "index.html");
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
}).listen(PORT);

console.log(`Server listening on http://localhost:${PORT}`);
mkdirSync("qa-shots", { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

try {
  // Shot 1: Menu with Roster Expanded
  {
    console.log("Capturing Shot 1: Main Menu with Faction Roster...");
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load", timeout: 60000 });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(1500);

    // Expand the roster preview if present
    try {
      const rosterBtn = page.getByText("Inspect Hero Classes");
      if (await rosterBtn.isVisible()) {
        await rosterBtn.click();
        await page.waitForTimeout(600);
      }
    } catch (e) {
      console.warn("Could not click roster button:", e.message);
    }

    await page.screenshot({
      path: "qa-shots/01-main-menu-roster.png",
      animations: "disabled",
      timeout: 60000,
    });
    console.log("Saved qa-shots/01-main-menu-roster.png");
    await context.close();
  }

  // Shot 2: In-Game Ashen Throne Board
  {
    console.log("Capturing Shot 2: Ashen Throne Gameplay View...");
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/?review=1&quality=high&era=requiem&arena=ashen`, {
      waitUntil: "load",
      timeout: 60000,
    });
    await page.evaluate(() => document.fonts.ready).catch(() => {});

    // Wait for the game engine to mount
    await page.waitForFunction(() => !!window.__kg?.controller, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: "qa-shots/02-ashen-throne-board.png",
      animations: "disabled",
      timeout: 60000,
    });
    console.log("Saved qa-shots/02-ashen-throne-board.png");
    await context.close();
  }

  // Shot 3: Combat Scenario
  {
    console.log("Capturing Shot 3: Combat Scenario...");
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/?scenario=capture&review=1&probe=1&quality=high&era=requiem&arena=ashen`, {
      waitUntil: "load",
      timeout: 60000,
    });
    await page.evaluate(() => document.fonts.ready).catch(() => {});

    await page.waitForFunction(() => {
      const snap = window.__kg?.controller?.getSnapshot();
      return snap && snap.sanList.length > 0;
    }, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);

    await page.screenshot({
      path: "qa-shots/03-combat-capture.png",
      animations: "disabled",
      timeout: 60000,
    });
    console.log("Saved qa-shots/03-combat-capture.png");
    await context.close();
  }
} catch (err) {
  console.error("Preview run error:", err);
} finally {
  await browser.close();
  server.close();
  console.log("Preview capture run complete!");
}
