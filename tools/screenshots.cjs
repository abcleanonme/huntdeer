// Captures App Store screenshots into store/screenshots/. Usage: npm run screenshots
// Sizes are the ones App Store Connect requires: 6.9" iPhone and 13" iPad, landscape.
const { spawn } = require('child_process');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright');

const devices = [
  // [folder, css width, css height, scale]: landscape sizes App Store Connect accepts.
  ['iphone-6.9', 956, 440, 3], // 2868x1320
  ['iphone-6.3', 874, 402, 3], // 2622x1206
  ['iphone-6.1', 852, 393, 3], // 2556x1179
  ['ipad-13', 1376, 1032, 2], // 2752x2064
  ['ipad-12.9', 1366, 1024, 2], // 2732x2048
];
const shots = [
  ['1-title', ''],
  ['2-forest', '?map=forest&animal=deer'],
  ['3-jungle', '?map=jungle&animal=bear&unlock=all'],
  ['4-arctic', '?map=arctic&animal=rabbit&unlock=all'],
  ['5-swamp', '?map=swamp&animal=duck&unlock=all'],
];
const only = process.argv[2];

(async () => {
  const vite = spawn('npx', ['vite', '--port', '5198', '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [dir, w, h, scale] of devices) {
    fs.mkdirSync(`store/screenshots/${dir}`, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, hasTouch: true, isMobile: true });
    for (const [name, query] of shots) {
      if (only && !name.includes(only)) continue;
      const page = await ctx.newPage();
      await page.goto(`http://localhost:5198/${query}`);
      if (query) {
        await page.waitForTimeout(7000);
        // Sneak up behind the nearest hunter so every gameplay shot has one in frame.
        await page.evaluate(() => {
          const g = window.__huntdeer.game;
          const p = g.player.pos;
          const near = g.hunters.slice().sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
          // Pick a hunter the camera (a few meters behind the player) can actually see.
          const clear = (h, d) => {
            const bx = -Math.sin(h.yaw), bz = -Math.cos(h.yaw);
            return g.world.lineOfSight(h.pos.x + bx * (d + 7), h.pos.z + bz * (d + 7), h.pos.x, h.pos.z);
          };
          let h = near[0], d = 8;
          outer: for (const c of near.slice(0, 8)) for (const dd of [8, 10, 6]) if (clear(c, dd)) { h = c; d = dd; break outer; }
          if (!h) return;
          const back = { x: -Math.sin(h.yaw), z: -Math.cos(h.yaw) };
          p.x = h.pos.x + back.x * d;
          p.z = h.pos.z + back.z * d;
          p.y = g.world.height(p.x, p.z);
          g.camYaw = Math.atan2(p.x - h.pos.x, p.z - h.pos.z);
        });
        await page.waitForTimeout(1500);
      } else {
        await page.waitForTimeout(4000);
      }
      await page.screenshot({ path: `store/screenshots/${dir}/${name}.png` });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  vite.kill();
})();
