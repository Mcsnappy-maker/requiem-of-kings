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
});

server.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  mkdirSync("qa-shots", { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    console.log("Navigating to main menu...");
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "qa-shots/01-main-menu.png", animations: "disabled", timeout: 45000 });
    console.log("Captured qa-shots/01-main-menu.png successfully!");

    console.log("Navigating to staged board (?review=1&arena=dusk&quality=medium)...");
    await page.goto(`http://localhost:${PORT}/?review=1&arena=dusk&quality=medium`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: "qa-shots/02-board-dusk.png", animations: "disabled", timeout: 45000 });
    console.log("Captured qa-shots/02-board-dusk.png successfully!");
  } catch (err) {
    console.error("Error during inspection:", err.message);
  } finally {
    await browser.close();
    server.close();
    process.exit(0);
  }
});
