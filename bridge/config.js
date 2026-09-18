import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const paths = {
  root,
  ui: path.join(root, 'ui'),
  bin: path.join(root, 'native', 'bin'),
};

export const config = {
  // Host port that `adb forward` maps to the Car Thing's Chromium devtools port (2222).
  // NOTE: never use `adb reverse` with this firmware — it crashes adbd and drops USB until a reboot.
  cdpPort: Number(process.env.CARTHING_CDP_PORT || 22222),

  // Where the UI lives on the device. /var/lib is the persistent "settings" partition,
  // so UI updates never need the read-only rootfs remounted.
  deviceUiDir: '/var/lib/carthing/ui',
  // What Chromium opens at boot (supervisord --app). scripts/setup-device.sh points it at deviceUiDir.
  deviceBootUrl: 'file:///usr/share/qt-superbird-app/webapp/index.html',

  // Buttons → action. Keys are what the device reports to the page: top buttons 1–4,
  // the back button under the knob (Escape) and the small settings button (m).
  // Actions: screen:<nowplaying|weather|clock|calendar> | settings | previous | next | playpause | null
  buttons: {
    1: 'screen:nowplaying',
    2: 'screen:weather',
    3: 'screen:clock',
    4: 'screen:calendar',
    Escape: 'settings',
    m: null,
  },
  // Knob press, by number of quick presses. A single press waits multiClickMs to see if more follow.
  knobClicks: { 1: 'playpause', 2: 'next', 3: 'previous' },
  multiClickMs: 350,

  // Mac-side settings page (weather location etc.), loopback only.
  settingsPort: Number(process.env.CARTHING_SETTINGS_PORT || 4747),

  volumeStep: 1 / 64, // per knob detent — macOS's fine (Option+Shift) volume-key step
  // true: turn the knob by pressing the Mac's volume keys so macOS shows its volume indicator.
  // Needs native/bin/volumectl allowed under Privacy & Security → Accessibility (software
  // can't press keys without it). false: set the volume directly — silent, no permission.
  macVolumeIndicator: false,
  knobDirection: 1, // set to -1 if turning clockwise lowers the volume

  // Knob press while nothing is playing starts this app.
  idlePlayApp: 'com.apple.Music',
  // Sources that don't get an app badge on the artwork (your "home" player).
  unbadgedApps: ['com.apple.Music'],
};
