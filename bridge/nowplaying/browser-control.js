import { execFile } from 'node:child_process';
import { BROWSERS } from './apps.js';
import { videoTitle } from './browser-art.js';

// Play/pause for a browser that isn't the player macOS is following (MediaRemote only delivers our
// commands to that one). The tab playing it is found by its title, as browser-art.js does, and the
// page's own <video>/<audio> elements are played or paused by a line of JavaScript run in it.
//
// That needs the browser's "Allow JavaScript from Apple Events" (Chromium browsers: View →
// Developer; Safari: Develop menu, or Settings → Advanced), which is off by default. Browsers that
// can't run a script in a tab (Firefox, Dia: null in BROWSERS) aren't supported at all.

const SAFARI = new Set(['com.apple.Safari', 'com.apple.SafariTechnologyPreview']);

/** Whether browserCommand() can try this app. */
export const canControlBrowser = (bundleId) => Boolean(BROWSERS[bundleId]);

// One line (AppleScript string), single quotes only. Returns what it did: 'play', 'pause' or 'none'.
const pageScript = (action) =>
  "(function(){var m=[].slice.call(document.querySelectorAll('video,audio'));if(!m.length)return 'none';" +
  "var on=m.filter(function(e){return !e.paused});var a='" + action + "';if(a==='playpause')a=on.length?'pause':'play';" +
  "if(a==='pause'){on.forEach(function(e){e.pause()});return 'pause'}" +
  "var t=m.filter(function(e){return e.currentTime>0})[0]||m[0];t.play();return 'play'})()";

const osascript = (source) =>
  new Promise((resolve) =>
    execFile('/usr/bin/osascript', ['-e', source], { timeout: 10000, maxBuffer: 4 << 20 }, (err, stdout, stderr) =>
      resolve(err ? { ok: false, error: String(stderr || err.message).trim() } : { ok: true, out: String(stdout).trim() }),
    ),
  );

/** Every tab as "window id <TAB> tab index <TAB> title" lines. */
function listTabs(bundleId) {
  const app = `application id ${JSON.stringify(bundleId)}`;
  return osascript(`if not (${app} is running) then return ""
set out to {}
tell ${app}
repeat with w in every window
set wid to id of w
set ts to ${BROWSERS[bundleId]} of every tab of w
repeat with j from 1 to count of ts
set end of out to (wid as text) & (character id 9) & (j as text) & (character id 9) & (item j of ts)
end repeat
end repeat
end tell
set AppleScript's text item delimiters to linefeed
return out as text`);
}

/** The one tab whose title is `title`, as {win (its id, as text), tab (its index)}; null for none, or more than one. */
export function matchingTab(listing, title) {
  const want = videoTitle(title);
  if (!want) return null;
  const found = [];
  for (const line of (listing || '').split('\n')) {
    const [win, tab, ...rest] = line.split('\t');
    if (rest.length && videoTitle(rest.join('\t')) === want) found.push({ win, tab: Number(tab) });
  }
  return found.length === 1 ? found[0] : null;
}

/**
 * Plays or pauses the media in the browser tab playing `title`.
 * @param {'play'|'pause'|'playpause'} action
 * @returns {Promise<{ok: boolean, did?: string, reason?: 'noTab'|'noMedia'|'javascriptOff'|'unsupported', error?: string}>}
 */
export async function browserCommand(bundleId, title, action) {
  if (!canControlBrowser(bundleId) || !['play', 'pause', 'playpause'].includes(action)) return { ok: false, reason: 'unsupported' };
  const tabs = await listTabs(bundleId);
  if (!tabs.ok) return { ok: false, error: tabs.error };
  const at = matchingTab(tabs.out, title);
  if (!at) return { ok: false, reason: 'noTab' };
  const app = `application id ${JSON.stringify(bundleId)}`;
  const js = JSON.stringify(pageScript(action));
  // Window ids are numbers in most browsers, text in some (Ardia: "w-…").
  const target = `tab ${at.tab} of window id ${/^\d+$/.test(at.win) ? at.win : JSON.stringify(at.win)}`;
  const r = await osascript(
    SAFARI.has(bundleId) ? `tell ${app} to do JavaScript ${js} in ${target}` : `tell ${app} to execute ${target} javascript ${js}`,
  );
  if (!r.ok) return /javascript/i.test(r.error) ? { ok: false, reason: 'javascriptOff', error: r.error } : { ok: false, error: r.error };
  if (r.out === 'none') return { ok: false, reason: 'noMedia' };
  return { ok: true, did: r.out };
}
