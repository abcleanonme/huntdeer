// Screenshots tools/keyart.html into store/keyart/. Usage: npm run keyart
const { spawn } = require('child_process');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright');
const shots = [
  ['header-3840x1646', 3840, 1646],
  ['search-3840x2560', 3840, 2560],
];
(async () => {
  const vite = spawn('npx', ['vite', '--port', '5197', '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  fs.mkdirSync('store/keyart', { recursive: true });
  for (const [name, w, h] of shots) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`http://localhost:5197/tools/keyart.html?w=${w}&h=${h}`);
    await page.waitForFunction(() => window.done, null, { timeout: 120000 });
    await page.screenshot({ path: `store/keyart/${name}.png` });
    await page.close();
  }
  await browser.close();
  vite.kill();
})();
