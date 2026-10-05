// Quick browser check of one game: a big screen and one phone play it for a while.
//   npm start            (in another terminal; or set BASE)
//   node scripts/smoke.cjs <game-id> [screenshot-folder]
// Uses Playwright (installed globally in Claude Code cloud sessions). Prints any
// page errors and saves screenshots of the big screen and the phone.

const { execSync } = require('node:child_process');
const path = require('node:path');

let playwright;
try { playwright = require('playwright'); } catch {
  playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium, devices } = playwright;

const game = process.argv[2];
const out = process.argv[3] || '.';
const BASE = process.env.BASE || 'http://localhost:3000';
if (!game) { console.error('Usage: node scripts/smoke.cjs <game-id> [screenshot-folder]'); process.exit(1); }

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const errors = [];
  const screenCtx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await screenCtx.addInitScript(() => localStorage.setItem('fgp.seenHowto', '1'));
  const screen = await screenCtx.newPage();
  screen.on('pageerror', (e) => errors.push(`screen: ${e.message}`));
  screen.on('console', (m) => { if (m.type() === 'error') errors.push(`screen console: ${m.text()}`); });
  await screen.goto(BASE);
  await screen.click('#welcome-start');
  await screen.waitForFunction(() => document.getElementById('room-code').textContent !== '----');
  const room = await screen.textContent('#room-code');

  const phoneCtx = await browser.newContext({ ...devices['iPhone 13'] });
  const phone = await phoneCtx.newPage();
  phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  await phone.goto(`${BASE}/play?room=${room}`);
  await phone.waitForSelector('#profile:not(.hidden)');
  await phone.fill('#name', 'Tester');
  await phone.click('[data-avatar]');
  await phone.click('#profile-done');
  await phone.waitForSelector('#lobby:not(.hidden)');

  await screen.click(`[data-pick="game"][data-value="${game}"]`);
  await screen.waitForTimeout(300);
  // Pick the first mode one phone can play.
  const modes = await screen.$$('[data-pick="mode"]');
  for (const m of modes) {
    await m.click();
    await screen.waitForTimeout(150);
    if (!(await screen.$eval('#start', (b) => b.disabled))) break;
  }
  if (await screen.$eval('#start', (b) => b.disabled)) throw new Error('START stayed disabled: no mode works with one phone');
  await screen.click('#start');
  await phone.waitForSelector('#controller .zone', { timeout: 10000 });

  // Swipe up and down for a while.
  const cdp = await phoneCtx.newCDPSession(phone);
  const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195, y }] });
  for (let i = 0; i < 4; i++) {
    await touch('touchStart', 420);
    for (let y = 420; y >= 150; y -= 30) await touch('touchMove', y);
    for (let y = 150; y <= 700; y += 30) await touch('touchMove', y);
    await touch('touchEnd');
    await screen.waitForTimeout(800);
  }
  await screen.screenshot({ path: path.join(out, `${game}-screen.png`) });
  await phone.screenshot({ path: path.join(out, `${game}-phone.png`) });

  // Pause and resume from the phone.
  await phone.click('#pause');
  await screen.waitForSelector('#held:not(.hidden)');
  await phone.click('#resume');
  await screen.waitForSelector('#held', { state: 'hidden' });

  console.log(errors.length ? `Problems:\n  ${errors.join('\n  ')}` : `OK: ${game} started, took input, paused and resumed with no errors.`);
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(`Smoke check failed: ${e.message}`); process.exit(1); });
