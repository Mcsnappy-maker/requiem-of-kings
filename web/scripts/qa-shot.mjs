// Usage: node scripts/qa-shot.mjs "<query>" out.png [waitMs] [port]
import { chromium } from "playwright";
const [query, out, wait = "25000", port = "5173"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const logs = [];
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
page.on("pageerror", (e) => logs.push("[pageerror] " + String(e).slice(0, 300)));
await page.goto(`http://localhost:${port}/?${query}`, { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => !!window.__kg?.controller, null, { timeout: 120000 }).catch(() => logs.push("no __kg"));
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out, animations: "disabled", timeout: 180000 });
console.log("saved", out);
console.log(logs.slice(0, 25).join("\n"));
await browser.close();

