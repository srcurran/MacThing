#!/usr/bin/env node
// Car Thing bridge: macOS Now Playing, volume, weather and calendar ⇄ the Car Thing's screen,
// knob and buttons. Also serves the Mac-side settings page.
//   npm start          run the bridge
//   npm run dev        …and redeploy the device UI whenever ui/ changes

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { Volume } from './audio/volume.js';
import { config, paths } from './config.js';
import { listCarThings, trackDevices } from './device/adb.js';
import { DeviceLink } from './device/link.js';
import { log } from './log.js';
import { AppInfo, kindOf } from './nowplaying/apps.js';
import { ArtworkCache } from './nowplaying/artwork.js';
import { MediaRemoteSource } from './nowplaying/mediaremote.js';
import { MacAppearance } from './mac/appearance.js';
import { MacHelper } from './mac/helper.js';
import { settings } from './settings.js';
import { startSettingsPage } from './settings-page/server.js';
import { Calendar } from './widgets/calendar.js';
import { Weather } from './widgets/weather.js';

const source = new MediaRemoteSource(paths.bin);
const volume = new Volume(paths.bin);
const apps = new AppInfo(paths.bin);
const artwork = new ArtworkCache();
const helper = new MacHelper(paths.bin);
const weather = new Weather(helper, settings);
const calendar = new Calendar(helper);
const appearance = new MacAppearance();

/** @type {DeviceLink|null} */
let link = null;
let connecting = false;

// ---- Now Playing ----------------------------------------------------------

// Latest snapshot with its artwork and app info resolved (both async, both cached).
let current = { np: source.snapshot, art: null, app: null };
let resolveSeq = 0;
let lastLogged = '';

async function onNowPlaying(snapshot) {
  const seq = ++resolveSeq;
  const [art, app] = await Promise.all([
    snapshot.artwork ? artwork.get(snapshot.artwork) : null,
    snapshot.bundleId ? apps.get(snapshot.bundleId) : null,
  ]);
  if (seq !== resolveSeq) return; // superseded by a newer update
  current = { np: snapshot, art, app };

  const summary = snapshot.active
    ? `${snapshot.playing ? '▶' : '❚❚'} ${snapshot.artist || '—'} · ${snapshot.title} [${app?.name || snapshot.bundleId}]`
    : 'nothing playing';
  if (summary !== lastLogged) log.info(`[now playing] ${(lastLogged = summary)}`);

  if (link) pushNowPlaying(link);
}

function nowPlayingMessage() {
  const { np, art, app } = current;
  if (!np.active) return { type: 'nowPlaying', np: { active: false } };

  let elapsed = null;
  if (np.elapsed != null) {
    elapsed = np.elapsed + ((Date.now() - np.elapsedAt) / 1000) * np.rate;
    if (np.duration) elapsed = Math.min(elapsed, np.duration);
    elapsed = Math.max(0, elapsed);
  }
  return {
    type: 'nowPlaying',
    np: {
      active: true,
      playing: np.playing,
      title: np.title,
      artist: np.artist,
      album: np.album,
      duration: np.duration,
      elapsed,
      rate: np.rate,
      kind: kindOf(np.bundleId),
      source: {
        bundleId: np.bundleId,
        name: app?.name || '',
        icon: config.unbadgedApps.includes(np.bundleId) ? null : app?.icon || null,
      },
      artworkKey: art?.key || null,
    },
  };
}

function pushNowPlaying(target) {
  const { art } = current;
  if (art && target.sentArtKey !== art.key) {
    target.send({ type: 'artwork', key: art.key, dataUrl: art.dataUrl, width: art.width, height: art.height });
    target.sentArtKey = art.key;
  }
  target.send(nowPlayingMessage());
}

const tickMessage = () => ({ type: 'tick', now: Date.now(), tzMinutes: -new Date().getTimezoneOffset() });

function pushAll(target) {
  target.sentArtKey = null; // page (re)loaded: it has no artwork cached
  target.send({
    type: 'config',
    config: {
      buttons: config.buttons,
      knobClicks: config.knobClicks,
      multiClickMs: config.multiClickMs,
      volumeStep: config.volumeStep,
      knobDirection: config.knobDirection,
      debug: Boolean(process.env.DEBUG), // page reports raw key/wheel events to the log
    },
  });
  target.send(tickMessage());
  target.send({ type: 'settings', settings: settings.get() });
  target.send({ type: 'appearance', dark: appearance.dark });
  if (volume.state) target.send({ type: 'volume', volume: volume.state });
  pushNowPlaying(target);
  target.send({ type: 'weather', weather: weather.state });
  target.send({ type: 'calendar', calendar: calendar.state });
}

async function macStatus() {
  const s = await helper.status().catch(() => ({}));
  return {
    location: { status: s.location || 'unknown', name: weather.auto?.name || null },
    calendar: { status: s.calendar || 'unknown' },
  };
}

function openSettingsPage(section) {
  const hash = /^[a-z]+$/.test(section || '') ? `#${section}` : '';
  execFile('/usr/bin/open', [`http://127.0.0.1:${config.settingsPort}/${hash}`]);
}

// ---- Input from the device ------------------------------------------------

function osascript(script) {
  return new Promise((resolve, reject) =>
    execFile('/usr/bin/osascript', ['-e', script], (err) => (err ? reject(err) : resolve())),
  );
}

async function runCommand(action) {
  log.info(`[input] ${action}`);
  try {
    if (!current.np.active && (action === 'playpause' || action === 'play')) {
      await osascript(`tell application id "${config.idlePlayApp}" to play`);
    } else {
      await source.command(action);
    }
  } catch (err) {
    log.warn(`[input] ${action} failed:`, err.message);
  }
}

function changeVolume(delta) {
  if (!Number.isFinite(delta) || delta === 0) return;
  if (config.macVolumeIndicator && volume.state?.keys) {
    const steps = Math.round(Math.abs(delta) / config.volumeStep);
    for (let i = 0; i < steps; i++) volume.pressKey(delta > 0);
  } else {
    volume.delta(delta);
  }
}

let askedForKeyAccess = false;
function checkKeyAccess(state) {
  if (!config.macVolumeIndicator || state.keys || askedForKeyAccess) return;
  askedForKeyAccess = true;
  log.warn(
    '[volume] to show the macOS volume indicator, allow "volumectl" in System Settings → ' +
      'Privacy & Security → Accessibility, then restart the bridge. Until then the knob sets the volume silently.',
  );
  volume.requestKeyAccess();
}

function onDeviceMessage(msg) {
  switch (msg.type) {
    case 'command':
      return runCommand(msg.action);
    case 'volume':
      return changeVolume(Number(msg.delta));
    case 'setting':
      return settings.update({ [msg.key]: msg.value });
    case 'openSettingsPage':
      return openSettingsPage(msg.section);
    case 'log':
      return log.info('[device]', msg.message);
  }
}

// ---- Device lifecycle -----------------------------------------------------

async function refreshDevices() {
  let devices;
  try {
    devices = await listCarThings();
  } catch (err) {
    return log.warn('[adb]', err.message);
  }
  if (link && !devices.some((d) => d.serial === link.serial)) link.close();
  if (!link && !connecting && devices.length) await connect(devices[0].serial);
}

async function connect(serial) {
  connecting = true;
  const l = new DeviceLink(serial);
  l.on('ready', () => pushAll(l));
  l.on('message', onDeviceMessage);
  l.on('close', () => {
    if (link !== l) return;
    link = null;
    log.info('[device] disconnected');
    setTimeout(refreshDevices, 1500);
  });
  link = l;
  try {
    log.info(`[device] connecting to ${serial}…`);
    await l.connect();
    log.info('[device] connected');
  } catch (err) {
    log.warn('[device] connect failed:', err.message);
    if (link === l) link = null;
    l.close();
    setTimeout(refreshDevices, 3000);
  } finally {
    connecting = false;
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---- Start ----------------------------------------------------------------

log.info('Car Thing bridge starting');
source.on('change', (s) => onNowPlaying(s).catch((err) => log.warn('[now playing]', err.message)));
volume.on('change', (v) => {
  checkKeyAccess(v);
  link?.send({ type: 'volume', volume: v });
});
settings.on('change', (values) => link?.send({ type: 'settings', settings: values }));
weather.on('change', (state) => link?.send({ type: 'weather', weather: state }));
calendar.on('change', (state) => link?.send({ type: 'calendar', calendar: state }));
appearance.on('change', (dark) => link?.send({ type: 'appearance', dark }));
source.start();
volume.start();
helper.start();
weather.start();
calendar.start();
appearance.start();
startSettingsPage({ port: config.settingsPort, settings, status: macStatus });

trackDevices(debounce(refreshDevices, 400));
refreshDevices();

setInterval(() => link?.send(tickMessage()), 2000);
setInterval(() => link?.send(nowPlayingMessage()), 15000); // re-anchor the device's progress clock

if (process.argv.includes('--watch')) {
  log.info(`[dev] watching ${paths.ui}`);
  const redeploy = debounce(() => link?.redeploy().catch((err) => log.warn('[dev] redeploy failed:', err.message)), 300);
  fs.watch(paths.ui, { recursive: true }, redeploy);
}

function shutdown() {
  log.info('shutting down');
  link?.send({ type: 'bye' });
  source.stop();
  volume.stop();
  helper.stop();
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
