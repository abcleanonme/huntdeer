// Screenshots tools/icon.html into the iOS asset catalog. Usage: npm run icons
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright');
(async () => {
  const vite = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const shots = [
    ['icon', 1024, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'],
    ['splash', 2732, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png'],
  ];
  for (const [mode, w, out] of shots) {
    const page = await browser.newPage({ viewport: { width: w, height: w } });
    await page.goto(`http://localhost:5199/tools/icon.html?mode=${mode}`);
    await page.waitForFunction(() => window.done, null, { timeout: 60000 });
    await page.screenshot({ path: out, omitBackground: false });
    if (mode === 'splash') {
      for (const n of ['-1', '-2']) require('fs').copyFileSync(out, out.replace('.png', `${n}.png`));
    }
    await page.close();
  }
  await browser.close();
  vite.kill();
})();
