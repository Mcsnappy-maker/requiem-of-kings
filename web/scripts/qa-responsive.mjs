import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const outputDir = process.argv[3] ?? "qa-shots/responsive";
const requested = new Set((process.argv[4] ?? "phone-low,phone,tablet,desktop").split(","));
mkdirSync(outputDir, { recursive: true });
const profiles = [
  ["phone-low", { viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, "low"],
  ["phone", devices["iPhone 13"]],
  ["tablet", devices["iPad (gen 7)"]],
  ["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
].filter(([name]) => requested.has(name));

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const failures = [];

for (const [name, profile, quality = "medium"] of profiles) {
  const phone = name.startsWith("phone");
  const context = await browser.newContext(profile);
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto(`${baseUrl}/?review=1&quality=${quality}&probe=1`, { waitUntil: "networkidle", timeout: 120_000 });
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
      actionTops: visibleButtons.filter((button) => button.closest('[data-hud="primary-actions"]'))
        .map((button) => button.getBoundingClientRect().top),
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
  if (phone) {
    for (const [region, width] of Object.entries(result.hudWidths)) {
      const limit = region === "primary-actions" ? Math.max(144, result.viewport[0] * 0.38) : result.viewport[0] * 0.38;
      if (width === null || width > limit + 0.1) {
        problems.push(`${region} exceeds compact width (${width ?? "missing"}px)`);
      }
    }
    if (Math.max(...result.actionTops) - Math.min(...result.actionTops) > 1) problems.push("primary actions wrap onto multiple rows");
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
  if (phone) {
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
    const menuBox = await menu.boundingBox();
    if (!menuBox || menuBox.x < 0 || menuBox.y < 0 || menuBox.x + menuBox.width > result.viewport[0] || menuBox.y + menuBox.height > result.viewport[1]) {
      problems.push(`secondary menu extends outside viewport: ${JSON.stringify(menuBox)}`);
    }
    await page.screenshot({ path: `${outputDir}/${name}-menu.png`, animations: "disabled", timeout: 180_000 });
    for (const button of await menu.getByRole("button").all()) {
      await button.scrollIntoViewIfNeeded();
      const reachable = await button.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const menuBox = element.closest('[data-hud="secondary-actions"]').getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        return box.top >= Math.max(0, menuBox.top) && box.bottom <= Math.min(innerHeight, menuBox.bottom)
          && box.left >= 0 && box.right <= innerWidth && element.contains(document.elementFromPoint(x, y));
      });
      if (!reachable) problems.push(`secondary action unreachable: ${await button.innerText()}`);
    }
    await page.screenshot({ path: `${outputDir}/${name}-menu-bottom.png`, animations: "disabled", timeout: 180_000 });
    await page.keyboard.press("Escape");
    if (await menu.count()) problems.push("secondary menu did not dismiss on Escape");
  }
  // Pin only the dragon's normal animation at the middle of its route; leave
  // the live camera, board, hall, lighting and depth buffer intact.
  const dragon = await page.evaluate(async () => {
    const engine = window.__kg.__engine;
    const flight = engine.battlefield.dragon;
    const update = flight.update.bind(flight);
    flight.update = () => update(8);
    flight.update();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    flight.group.updateMatrixWorld(true);
    engine.hall.group.updateMatrixWorld(true);
    engine.camera.updateMatrixWorld();
    const points = [];
    let clear = 0;
    flight.group.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const positions = mesh.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        const world = engine.camera.position.clone().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        const direction = world.clone().sub(engine.camera.position);
        engine.raycaster.set(engine.camera.position, direction.clone().normalize());
        engine.raycaster.far = direction.length() - 0.01;
        const hidden = engine.raycaster.intersectObject(engine.hall.group, true).some(({ object }) => {
          if (!object.visible || !object.isMesh) return false;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          return materials.some((material) => !material.transparent || material.opacity >= 0.85);
        });
        if (!hidden) clear++;
        points.push(world.project(engine.camera));
      }
    });
    const rect = engine.canvas.getBoundingClientRect();
    return {
      vertices: points.length,
      clearFraction: clear / points.length,
      left: (Math.min(...points.map((p) => p.x)) + 1) * rect.width / 2,
      right: (Math.max(...points.map((p) => p.x)) + 1) * rect.width / 2,
      top: (1 - Math.max(...points.map((p) => p.y))) * rect.height / 2,
      bottom: (1 - Math.min(...points.map((p) => p.y))) * rect.height / 2,
      inFront: points.every((p) => p.z > -1 && p.z < 1),
    };
  });
  result.dragon = dragon;
  if (!dragon.inFront || dragon.left < 0 || dragon.right > result.viewport[0] || dragon.top < 0 || dragon.bottom > result.viewport[1]) problems.push(`dragon clipped or offscreen: ${JSON.stringify(dragon)}`);
  if (dragon.right - dragon.left < 45) problems.push("dragon too small to recognize");
  if (dragon.bottom + 8 > bounds?.top) problems.push("dragon overlaps battle envelope");
  if (dragon.clearFraction < 0.9) problems.push(`hall obscures dragon (${dragon.clearFraction} clear)`);
  await page.screenshot({ path: `${outputDir}/${name}-dragon.png`, animations: "disabled", timeout: 180_000 });
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
