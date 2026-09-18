import { execFile } from 'node:child_process';
import path from 'node:path';

const MUSIC = new Set([
  'com.apple.Music',
  'com.apple.iTunes',
  'com.apple.podcasts',
  'com.spotify.client',
  'com.tidal.desktop',
  'com.amazon.music',
  'com.deezer.deezer-desktop',
  'com.plexamp.plexamp',
  'com.coppertino.Vox',
  'com.roon.Roon',
]);

const BROWSERS = new Set([
  'com.apple.Safari',
  'com.apple.SafariTechnologyPreview',
  'com.google.Chrome',
  'com.google.Chrome.canary',
  'company.thebrowser.Browser', // Arc
  'company.thebrowser.dia',
  'org.mozilla.firefox',
  'com.microsoft.edgemac',
  'com.brave.Browser',
  'com.vivaldi.Vivaldi',
  'com.operasoftware.Opera',
  'app.zen-browser.zen',
]);

const VIDEO = new Set([
  'com.apple.TV',
  'com.apple.QuickTimePlayerX',
  'org.videolan.vlc',
  'com.colliderli.iina',
]);

/** 'music' | 'web' | 'video' | 'other' — drives small presentation differences on the device. */
export function kindOf(bundleId) {
  if (!bundleId) return 'other';
  if (MUSIC.has(bundleId)) return 'music';
  if (BROWSERS.has(bundleId)) return 'web';
  if (VIDEO.has(bundleId)) return 'video';
  return 'other';
}

/** Looks up (and caches) an app's display name and icon via native/bin/appinfo. */
export class AppInfo {
  constructor(binDir) {
    this.bin = path.join(binDir, 'appinfo');
    this.cache = new Map();
  }

  /** @returns {Promise<{name: string, icon: string|null}>} icon is a PNG data URL */
  get(bundleId) {
    if (!bundleId) return Promise.resolve({ name: '', icon: null });
    if (!this.cache.has(bundleId)) {
      this.cache.set(
        bundleId,
        new Promise((resolve) => {
          execFile(this.bin, [bundleId, '96'], { maxBuffer: 8 << 20 }, (err, stdout) => {
            let info = {};
            try {
              info = err ? {} : JSON.parse(stdout);
            } catch {}
            resolve({
              name: info.name || bundleId.split('.').pop(),
              icon: info.icon ? `data:image/png;base64,${info.icon}` : null,
            });
          });
        }),
      );
    }
    return this.cache.get(bundleId);
  }
}
