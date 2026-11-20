import { watch } from 'vue';
import { state, CT } from './state.js';
import { timerBusy, startedCountdowns } from './timer.js';
import { usageProviders, usageName, paceNumber, SESSION_MS, WEEK_MS } from './usage.js';
import { usageWatch, weatherWatch, timerWatch } from './smart-triggers.js';

// Settings → Smart switching: the screen moves by itself when something is worth a look.
//   Claude or ChatGPT usage heats up (the Claude-o-meter gains a 🔥, a second 🔥 or the 💀, which
//   follow the burn of the last 10–20 minutes; again when fires come back after 15 calm minutes)
//   or comes back (a session or week that was well used resets): that usage, on the clock screen.
//   Rain or snow is due within the hour: the weather's forecast.
//   A timer you started (a preset, or a meeting's countdown you queued or showed from its alert)
//   has a minute left: that timer, full size. This one goes even with the timer up (another
//   timer, say), and nothing else takes its place while it waits.
// Taken off Now Playing, it goes back there on the first song change after HOLD_MS, so the screen
// it put up stays at least that long but not for as long as the music goes on. Moving the screen,
// or pressing a top button, settles it where it is. (Meetings have their own alert, so the
// calendar never needs this.)
const HOLD_MS = 30000;
const QUIET_MS = 10000; // after a button or the knob, wait this long: someone is using the device
const PENDING_MS = 3 * 60000; // something in the way for longer than this: let the moment go

const usageChecks = { claude: usageWatch(), chatgpt: usageWatch() };
const weatherCheck = weatherWatch();
const timerCheck = timerWatch();
let pending = null; // { show: () => void, note, until, timer? }
let placed = ''; // the screen this put up, until someone moves off it
let returnTo = ''; // 'nowplaying' when that's where this took the screen from
let holdUntil = 0;
let lastInput = -Infinity;

const enabled = () => !!state.settings.smartSwitch;
const logEvent = text => CT.logEvent && CT.logEvent('[smart switch] ' + text);

/** The numbers behind a usage switch, for the log: "session 10% 1.0x 🔥 · week 23% 0.4x". */
function usageDetail(usage, now) {
  if (!usage || usage.status !== 'ok') return usage ? usage.status : 'no reading';
  const s = usage.session, w = usage.week;
  return 'session ' + s.percent + '% ' + paceNumber(s, SESSION_MS, now, { updatedAt: usage.updatedAt })
    + ' · week ' + w.percent + '% ' + paceNumber(w, WEEK_MS, now, { maxFires: 0 })
    + (usage.stale ? ' (stale)' : '');
}

const timerUp = () => timerBusy.value;
function busy(forTimer) {
  return state.offline || state.asleep || !!CT.lockedTo || state.current === 'settings'
    || (CT.modalOpen && CT.modalOpen()) || (!forTimer && timerUp()) || performance.now() - lastInput < QUIET_MS;
}

// How long the note saying why the screen moved stays up.
const NOTE_MS = 5000;

function want(show, note, timer, detail) {
  if (!enabled() || (pending && pending.timer && !timer)) return;
  logEvent('wants to show: ' + note + (detail ? ' — ' + detail : ''));
  pending = { show, note, timer, until: performance.now() + PENDING_MS };
}

function go({ show, note }) {
  const from = state.current;
  show();
  CT.note(note, NOTE_MS);
  logEvent('showed: ' + note + ' (on ' + state.current + ', was ' + from + ')');
  if (state.current === from) return; // already there, or the screen wouldn't move
  if (from === 'nowplaying') returnTo = 'nowplaying';
  placed = state.current;
  holdUntil = performance.now() + HOLD_MS;
}

CT.onSecond(now => {
  // Every watcher looks every second, on or off, so turning the setting on doesn't treat
  // whatever has built up meanwhile as new.
  const shown = usageProviders(state);
  Object.keys(usageChecks).forEach(provider => {
    const usage = provider === 'chatgpt' ? state.chatgptUsage : state.usage;
    const event = usageChecks[provider](usage, now);
    if (event && shown.includes(provider)) {
      want(() => CT.showUsage && CT.showUsage(provider),
        event === 'limit' ? 'Out of ' + usageName(provider) + ' usage'
          : usageName(provider) + (event === 'hot' ? ' usage is speeding up' : ' usage is reset'),
        false, usageDetail(usage, now));
    }
  });
  const wet = weatherCheck(state.weather, now);
  if (wet) want(() => CT.showForecast && CT.showForecast(), wet);
  const ending = timerCheck(startedCountdowns(), now);
  if (ending) {
    want(() => CT.showTimer && CT.showTimer(ending.id), 'Timer ends in 1 min', true);
    // Once it's over there's nothing to warn about.
    if (pending && pending.timer) pending.until = performance.now() + Math.max(0, ending.endsAt - now);
  }
  if (!pending) return;
  if (!enabled() || performance.now() > pending.until) {
    if (enabled()) logEvent('gave up on: ' + pending.note + ' (something was in the way until it was too late)');
    pending = null;
  }
  else if (!busy(pending.timer)) { const next = pending; pending = null; go(next); }
});

function settle() { placed = ''; returnTo = ''; }
// Vue runs this after go() has noted the screen it put up, so only someone else's move settles it.
watch(() => state.current, current => { if (current !== placed) settle(); });
watch(enabled, on => { if (!on) { settle(); pending = null; } });
CT.on('input', key => {
  lastInput = performance.now();
  if (/^[1-4m]$/.test(key)) settle(); // a top or settings button: choosing what's on screen
});

const trackOf = np => np.active ? np.title + '\n' + np.artist + '\n' + np.album : '';
watch(() => trackOf(state.np), track => {
  if (!track || !returnTo || state.current !== placed || performance.now() < holdUntil) return;
  if (CT.lockedTo || (CT.modalOpen && CT.modalOpen())) return;
  CT.show(returnTo);
  logEvent('back to ' + returnTo + ' on the song change');
  settle();
});
