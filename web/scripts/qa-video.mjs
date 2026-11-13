// Records the hero duel in the real game via CDP screencast (timestamped JPEG frames).
// Usage: node scripts/qa-video.mjs [scenario=duel] [seconds=75] [outDir=qa-shots/duel] [port=5173]
import { chromium } from "playwright";
import fs from "fs";
const [scenario = "duel", seconds = "75", outDir = "qa-shots/duel", port = "5173"] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (f.endsWith(".jpg")) fs.unlinkSync(`${outDir}/${f}`);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
const page = await context.newPage();
const logs = [];
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1);
page.on("console", (m) => { if (/scene|pieces|game|hero|error/i.test(m.text())) logs.push(`${stamp()}s [${m.type()}] ${m.text().slice(0, 220)}`); });
page.on("pageerror", (e) => logs.push(`${stamp()}s [pageerror] ` + String(e).slice(0, 300)));
const cdp = await context.newCDPSession(page);
let n = 0;
cdp.on("Page.screencastFrame", async (f) => {
  n += 1;
  fs.writeFileSync(`${outDir}/f_${String(Math.round((Date.now() - t0) / 100)).padStart(5, "0")}.jpg`, Buffer.from(f.data, "base64"));
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: Number(process.env.W ?? 1280), maxHeight: Number(process.env.H ?? 720), everyNthFrame: 1 });
await page.goto(`http://localhost:${port}/?scenario=${scenario}&review=1&probe=1&quality=${process.env.Q ?? "high"}&seed=duel`, { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => !!window.__kg?.controller, null, { timeout: 120000 });
logs.push(`${stamp()}s engine up`);
const result = await page.waitForFunction(() => {
  const s = window.__kg.controller.getSnapshot();
  return s.sanList.length > 0 && !s.busy ? { san: s.sanList.at(-1), fen: s.fen, captured: s.captured.length, status: s.status, timeouts: window.__kg.controller.getAnimationTimeouts?.() } : null;
}, null, { timeout: Number(seconds) * 1000, polling: 250 }).then((h) => h.jsonValue()).catch((e) => ({ error: String(e).slice(0, 120) }));
logs.push(`${stamp()}s result ${JSON.stringify(result)}`);
await page.waitForTimeout(3000);
await cdp.send("Page.stopScreencast").catch(() => {});
console.log(`frames: ${n}`);
console.log(logs.join("\n"));
await browser.close();

