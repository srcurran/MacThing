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

/**
 * Web browsers: bundle id → the AppleScript property that holds a tab's title, for browsers
 * whose tabs scripts can read (browser-art.js uses it to find the playing tab and load larger
 * artwork), or null for browsers that don't let scripts see their tabs.
 */
export const BROWSERS = {
  'com.apple.Safari': 'name', // Safari's tabs have no "title"
  'com.apple.SafariTechnologyPreview': 'name',
  'com.google.Chrome': 'title',
  'com.google.Chrome.beta': 'title',
  'com.google.Chrome.dev': 'title',
  'com.google.Chrome.canary': 'title',
  'org.chromium.Chromium': 'title',
  'com.microsoft.edgemac': 'title',
  'com.microsoft.edgemac.Beta': 'title',
  'com.microsoft.edgemac.Dev': 'title',
  'com.microsoft.edgemac.Canary': 'title',
  'com.brave.Browser': 'title',
  'com.brave.Browser.beta': 'title',
  'com.brave.Browser.nightly': 'title',
  'com.vivaldi.Vivaldi': 'title',
  'com.operasoftware.Opera': 'title',
  'com.operasoftware.OperaGX': 'title',
  'company.thebrowser.Browser': 'title', // Arc
  'com.ardia.browser': 'title', // Ardia
  'company.thebrowser.dia': null, // Dia
  'org.mozilla.firefox': null,
  'app.zen-browser.zen': null,
};

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
  if (Object.hasOwn(BROWSERS, bundleId)) return 'web';
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
