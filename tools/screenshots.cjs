// Captures App Store screenshots into store/screenshots/. Usage: npm run screenshots
// Sizes are the ones App Store Connect requires: 6.9" iPhone and 13" iPad, landscape.
const { spawn } = require('child_process');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright');

const devices = [
  // [folder, css width, css height, scale] -> 2868x1320 and 2752x2064 pixels
  ['iphone-6.9', 956, 440, 3],
  ['ipad-13', 1376, 1032, 2],
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
      await page.waitForTimeout(query ? 9000 : 4000);
      await page.screenshot({ path: `store/screenshots/${dir}/${name}.png` });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  vite.kill();
})();
