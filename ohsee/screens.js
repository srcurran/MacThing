// ohsee script test: every screen of the UI, fed fixture data. A Playwright function body; ohsee
// passes `page` and `ohsee`, and runs it once against prod (the base ref) and once against dev
// (this checkout). See ohsee.config.json and AGENTS.md.
//
// The data mirrors scripts/verify-device-ui.js, but this runs in ohsee's own Chromium at the
// device's 800×480, never on the Car Thing, so it's safe to run while someone is using the device.
//
// Snapshots pair across prod and dev by call order, so every snapshot below must run on both,
// whatever the page does. Waits that can fail are wrapped so one bad screen doesn't lose the rest.

// One frozen moment, Tuesday 22 September 2026, 2:35 PM at UTC (the page runs at UTC): the
// clocks, progress bars and "in 25 minutes" labels then read the same on prod and dev.
const NOW = Date.UTC(2026, 8, 22, 14, 35);
const HOUR = 3600000;
const DAY = 86400000;
await page.clock.setFixedTime(NOW);

await page.goto('/');
await page.waitForFunction(() => !!window.CT && !!document.querySelector('#mount')?.__vue_app__, null, { timeout: 15000 });

// Take over the page's link to the Mac: fixture messages in, outgoing messages kept on the page.
await page.evaluate(() => {
  window.fixtureReceive = window.__carthingReceive;
  window.__carthingReceive = function () {};
  window.fixtureSent = [];
  window.CT.send = (msg) => window.fixtureSent.push(msg);
});
const send = async (msg) => {
  await page.evaluate((m) => window.fixtureReceive(m), msg);
  await page.waitForTimeout(80);
};
const show = async (screen) => {
  await page.evaluate((s) => window.CT.show(s), screen);
  await page.waitForTimeout(450); // screens cross-fade (0.3 s) before the old one leaves the page
};
// The hardware buttons: 1–4 along the top, Enter is the knob press.
const press = async (key) => {
  await page.evaluate((k) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k }));
  }, key);
  await page.waitForTimeout(450);
};

const settings = { theme: 'dark', units: 'F', clock24h: false, artBackground: true, clockFace: 'analog', calendarDays: 2, location: { mode: 'auto' } };
const artwork = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="#15536b"/>' +
  '<circle cx="320" cy="160" r="130" fill="#d89951"/><rect x="40" y="300" width="220" height="140" fill="#e4572e"/></svg>',
).toString('base64');
// A 1×1 PNG: the perpetual calendar cover the idle screen shows.
const perpetual = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

await send({ type: 'settings', settings });
await send({ type: 'screen', on: true });
// The page keeps the least-delayed of the last 15 ticks, so set the time with all 15. Then keep
// ticking once a second as the bridge does: 6.5 s without a message and the page decides the Mac
// is gone and shows "Waiting for your Mac".
await page.evaluate((now) => {
  for (let i = 0; i < 15; i++) window.fixtureReceive({ type: 'tick', now, tzMinutes: 0 });
  setInterval(() => window.fixtureReceive({ type: 'tick', now, tzMinutes: 0 }), 1000);
}, NOW);
await send({ type: 'weather', weather: {
  status: 'ok', place: 'Falmouth', utcOffset: 0, updatedAt: NOW, current: { temp: 68, code: 2, isDay: true },
  hourly: Array.from({ length: 11 }, (_, i) => ({ t: NOW + i * HOUR, temp: 68 - i, code: i < 4 ? 2 : 61, isDay: i < 5, pop: 10 + i * 8 })),
  daily: Array.from({ length: 5 }, (_, i) => ({ t: NOW + i * DAY, lo: 45 + i, hi: 68 + i, code: [2, 3, 61, 0, 71][i], pop: [10, 40, 80, 0, 60][i] })),
} });
await send({ type: 'calendar', calendar: { status: 'ok', events: [
  { start: NOW + 0.5 * HOUR, end: NOW + 1.5 * HOUR, title: 'Design sync', location: 'Studio B', color: '#30d158', calendarId: 'fixture' },
  { start: NOW + 3 * HOUR, end: NOW + 4.5 * HOUR, title: 'Dinner with Sam & Alex', location: 'The Corner Table', color: '#ff8b00', calendarId: 'fixture' },
  { start: NOW + DAY - 2 * HOUR, end: NOW + DAY - HOUR, title: 'Book club', color: '#bf5af2', calendarId: 'fixture' },
] } });
await send({ type: 'perpetual', perpetual: { status: 'ok', day: 20718, dataUrl: perpetual } });

// Now Playing: album art and its blurred background, paused so the progress bar holds still.
await send({ type: 'nowPlaying', np: { active: true, artist: 'Cate Le Bon', title: 'Moderation', album: 'Pompeii', artworkKey: 'fixture-art', duration: 250, elapsed: 62, rate: 0, playing: false } });
await send({ type: 'artwork', key: 'fixture-art', dataUrl: artwork });
await show('nowplaying');
await ohsee.snapshot('nowplaying');

await send({ type: 'settings', settings: { ...settings, theme: 'light' } });
await ohsee.snapshot('nowplaying-light');
await send({ type: 'settings', settings: { ...settings, artBackground: false } });

// The longest title the left rail has to fit.
await send({ type: 'nowPlaying', np: { active: true, artist: 'Do Make Say Think', title: 'A very long title that needs to fit within the available left rail without hiding the album or the progress bar', album: 'Goodbye Enemy Airship the Landlord Is Dead', artworkKey: null, duration: 398, elapsed: 50, rate: 0, playing: false } });
await ohsee.snapshot('nowplaying-long-title');

// Nothing playing: the date, the time and the perpetual cover.
await send({ type: 'nowPlaying', np: { active: false } });
await ohsee.snapshot('idle');

await show('weather');
await ohsee.snapshot('weather');
await press('3');
await ohsee.snapshot('weather-today');
await press('3');
await ohsee.snapshot('weather-week');
await press('3'); // back to the forecast

await show('calendar');
await ohsee.snapshot('calendar');
await press('2');
await ohsee.snapshot('calendar-month');
await press('2'); // back to the agenda

await show('clock');
await ohsee.snapshot('clock');

await show('settings');
await ohsee.snapshot('settings');
