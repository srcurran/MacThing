import { execFile, spawn } from 'node:child_process';

// WARNING: do not add `adb reverse` here. The Car Thing's adbd (8.9.2 firmware) crashes on it,
// which unbinds the USB gadget — the device vanishes from USB until it is power-cycled.
// Everything goes Mac → device instead (adb forward + Chromium devtools).

const ADB = process.env.ADB || 'adb';

export function adb(args, { serial, timeout = 20000 } = {}) {
  const full = serial ? ['-s', serial, ...args] : args;
  return new Promise((resolve, reject) => {
    execFile(ADB, full, { timeout, maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { message: `adb ${full.join(' ')}: ${stderr || err.message}`.trim() }));
      else resolve(stdout);
    });
  });
}

export const shell = (serial, cmd, opts) => adb(['shell', cmd], { serial, ...opts });

/** Car Things that are attached and online. */
export async function listCarThings() {
  const out = await adb(['devices', '-l']);
  return out
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state, ...info]) => serial && state === 'device' && /spotify-car-thing|Car_Thing/.test(info.join(' ')))
    .map(([serial]) => ({ serial }));
}

/**
 * Restart the adb server.
 *
 * Its device list goes stale after the Mac sleeps: the Car Thing is still on the USB bus and
 * `ioreg -p IOUSB` lists it, but `adb devices` stays empty until the server is restarted, so
 * nothing on this side can reach a device that is sitting there perfectly healthy.
 */
export async function restartServer() {
  await adb(['kill-server'], { timeout: 10000 }).catch(() => {});
  await adb(['start-server'], { timeout: 20000 }).catch(() => {});
}

/** Calls onChange() whenever adb's device list changes (plug, unplug, reboot). Returns stop(). */
export function trackDevices(onChange) {
  let proc;
  let stopped = false;
  const start = () => {
    proc = spawn(ADB, ['track-devices'], { stdio: ['ignore', 'pipe', 'ignore'] });
    proc.stdout.on('data', () => onChange()); // length-prefixed device lists; the signal is all we need
    proc.on('exit', () => !stopped && setTimeout(start, 2000));
  };
  start();
  return () => {
    stopped = true;
    proc?.kill();
  };
}
