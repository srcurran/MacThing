#!/usr/bin/env node
// Saves the README's screenshots: npm run mock-screens -- [preset] [out-dir]
//
// Runs on the real device so the pictures are what the Car Thing draws, but feeds it fixture
// data instead of whatever is playing — one Friday evening, the same on every run. The page is
// reloaded afterwards, which puts the live bridge data and input handlers back.
//
// Two presets, because the album art background changes every screen: `hug` (the default) has it
// on and writes docs/<screen>.png, `polvo` has it off and writes docs/<screen>-polvo.png.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../bridge/config.js';
import { adb, listCarThings } from '../bridge/device/adb.js';
import { CDP, listTargets } from '../bridge/device/cdp.js';

const presets = {
  hug: {
    suffix: '', artBackground: true, art: 'mock-art.png',
    np: { artist: 'HUG', title: 'Cow With Half Moon Parasol', album: 'HUG', duration: 276, elapsed: 69 },
  },
  polvo: {
    suffix: '-polvo', artBackground: false, art: 'mock-art-polvo.png',
    np: { artist: 'Polvo', title: 'When Will You Die for the Last Time in My Dreams', album: 'Exploded Drawing', duration: 703, elapsed: 176 },
  },
};

const args = process.argv.slice(2);
const name = args.find((a) => !a.includes('/')) || 'hug';
const preset = presets[name];
if (!preset) {
  console.error(`Unknown preset "${name}" — try ${Object.keys(presets).join(' or ')}`);
  process.exit(1);
}
const out = args.find((a) => a.includes('/')) || 'docs';
const here = path.dirname(new URL(import.meta.url).pathname);

const now = Date.UTC(2026, 8, 18, 18, 5); // Friday 18 September, 6:05 PM
const HOUR = 3600000;
const DAY = 86400000;
const midnight = Date.UTC(2026, 8, 18);
const at = (day, hours) => midnight + day * DAY + hours * HOUR;

const settings = {
  theme: 'dark', units: 'F', clock24h: false, artBackground: preset.artBackground,
  clockFace: 'analog', calendarDays: 2, location: { mode: 'auto' },
};

const calendar = {
  status: 'ok',
  events: [
    { start: at(0, 17.5), end: at(0, 19), title: 'Dinner with Sam & Alex', location: 'Studio B', color: '#ff8b00' },
    { start: at(0, 19.5), end: at(0, 21), title: 'Book club', location: 'Studio B', color: '#bf5af2' },
    { start: at(1, 13), end: at(1, 14), title: 'Design review', color: '#30d158' },
  ],
};

const hour = (i, temp, code, isDay, pop) => ({ t: at(0, 18 + i), temp, code, isDay, pop });
const day = (i, code, pop, lo, hi) => ({ t: midnight + i * DAY, code, pop, lo, hi });
const weather = {
  status: 'ok', place: 'Portland', utcOffset: 0, updatedAt: now,
  current: { temp: 69, code: 0, isDay: true },
  hourly: [hour(0, 69, 0, true, 0), hour(1, 68, 0, true, 0), hour(2, 64, 0, false, 0), hour(3, 61, 0, false, 0), hour(4, 57, 53, false, 20), hour(5, 56, 3, false, 20)],
  daily: [day(0, 63, 55, 56, 77), day(1, 3, 0, 56, 77), day(2, 63, 55, 44, 63), day(3, 3, 0, 44, 77), day(4, 2, 10, 50, 72), day(5, 61, 40, 52, 68)],
};

const [device] = await listCarThings();
if (!device) {
  console.error('No Car Thing found over adb');
  process.exit(1);
}
await adb(['forward', `tcp:${config.cdpPort}`, 'tcp:2222'], { serial: device.serial });
const page = (await listTargets(config.cdpPort)).find((t) => t.type === 'page');
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
await cdp.send('Runtime.enable');

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const send = (msg) => evaluate(`window.__mockReceive(${JSON.stringify(msg)})`);

// weather-today and weather-week: the weather screen's button pressed until that view is up.
const views = { today: '.w-today', week: '.w-week' };
async function capture(screen) {
  const [base, view] = screen.split('-');
  await evaluate(`CT.show(${JSON.stringify(base)})`);
  for (let i = 0; view && i < 3 && !(await evaluate(`!!document.querySelector(${JSON.stringify(views[view])})`)); i++) {
    await evaluate(`CT.screens.${base}.reselect()`);
  }
  await pause(600); // let the screen transition and any font fitting settle
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(out, `${screen}${preset.suffix}.png`);
  await fs.writeFile(file, Buffer.from(data, 'base64'));
  console.log(file);
}

try {
  // Take the bridge's messages out of the page, so live data can't overwrite the fixtures.
  await evaluate('window.__mockReceive = window.__carthingReceive; window.__carthingReceive = function () {}; CT.send = function () {}');
  await send({ type: 'settings', settings });
  await send({ type: 'screen', on: true });
  await send({ type: 'tick', now, tzMinutes: 0 });
  await send({ type: 'calendar', calendar });
  await send({ type: 'weather', weather });

  const artwork = await fs.readFile(path.join(here, '..', 'docs', preset.art));
  await send({ type: 'nowPlaying', np: { active: true, kind: 'music', ...preset.np, rate: 1, playing: true, artworkKey: 'mock' } });
  await send({ type: 'artwork', key: 'mock', dataUrl: `data:image/png;base64,${artwork.toString('base64')}` });

  await fs.mkdir(out, { recursive: true });
  for (const screen of ['nowplaying', 'calendar', 'weather', 'weather-today', 'weather-week', 'clock', 'settings']) await capture(screen);
} finally {
  await cdp.send('Page.reload', { ignoreCache: true });
  cdp.close();
}
