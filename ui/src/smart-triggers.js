// What Smart switching reacts to (smart.js does the switching). Plain functions over the Mac's
// readings, with no Vue, so the tests can drive them.
import { SESSION_MS, paceK, burnK, fires } from './usage.js';
import { isWet, describe } from './weather.js';

const HOUR = 3600000;

/** How hot the session reads on the Claude-o-meter: 0 calm, 1 🔥, 2 🔥🔥, 3 💀 (at the limit). The
 *  fires follow the burn right now when the Mac has one, else the average so far (see paceNumber). */
export function heat(usage, now) {
  const w = usage.session, k = paceK(w, SESSION_MS, now);
  if (!Number.isFinite(k)) return 3;
  return [...fires(burnK(w, usage.updatedAt, now) ?? k)].length;
}

// A window that ends after this much use is worth showing: the allowance is back.
export const RESET_MIN_PERCENT = 80;

// No fires for this long and the session counts as cooled off: fires coming back are news again.
export const COOL_MS = 15 * 60000;

// The API's reset time wobbles by a second or so between readings of the same window.
const sameWindow = (a, b) => a === b || (!!a && !!b && Math.abs(a - b) < 60000);

/**
 * Watches one provider's usage. check(usage, now) returns 'hot' when the session's fires climb
 * higher than they have been since it last cooled off (see heat); 'limit' the first time a session
 * hits its limit, after which it says nothing more about that session's heat (locked out, the burn
 * falls to nothing, and a reading of 99% between 100s would otherwise read as cooling off and
 * announce the limit again and again); 'reset' when a session or week that was at least
 * RESET_MIN_PERCENT used runs out; else ''. Staying hot never switches again: only COOL_MS without
 * fires (through a new session too) makes fires news again. The first reading only sets the
 * baseline, so a page load never switches anything.
 */
export function usageWatch() {
  let session = null, week = null; // { resetsAt, percent, ended, limited? }
  let tier = null, calmSince = null, lastAt = null; // the most fires shown since the last cool-off
  function ended(win, now) {
    if (!win || !win.resetsAt || win.ended || now < win.resetsAt) return false;
    win.ended = true;
    return win.percent >= RESET_MIN_PERCENT;
  }
  function track(win, reading) {
    if (win && sameWindow(win.resetsAt, reading.resetsAt)) {
      win.percent = reading.percent;
      win.resetsAt = reading.resetsAt;
      return win;
    }
    // A new window (or the first reading): the old one is done with.
    return { resetsAt: reading.resetsAt, percent: reading.percent, ended: false };
  }
  return function check(usage, now) {
    // The time can run out between readings, so this looks before any new reading is taken in.
    const reset = ended(session, now) || ended(week, now);
    if (!usage || usage.status !== 'ok') return reset ? 'reset' : '';
    const first = !session;
    session = track(session, usage.session);
    week = track(week, usage.week);
    const hot = heat(usage, now);
    if (first) session.limited = hot === 3;
    if (tier == null) tier = hot;
    if (!hot && calmSince == null) calmSince = now;
    // Calm until now, or (when hot again) until the reading before: that's as long as it was seen calm.
    if (calmSince != null && (hot ? lastAt : now) - calmSince >= COOL_MS) tier = 0; // cooled off
    if (hot) calmSince = null;
    lastAt = now;
    if (reset) return 'reset';
    if (session.limited) return '';
    if (hot === 3) { session.limited = true; tier = hot; return 'limit'; }
    if (hot > tier) { tier = hot; return 'hot'; }
    return '';
  };
}

// Rain or snow this likely counts as coming.
export const WET_MIN_POP = 50;

/** The hour rain or snow is due in, within the hour, when it isn't falling yet; else null. */
export function wetSoon(weather, now) {
  if (!weather || weather.status !== 'ok' || isWet(weather.current.code)) return null;
  return weather.hourly.filter(h => h.t <= now + HOUR).slice(-2)
    .find(h => h.t + HOUR > now && isWet(h.code) && h.pop >= WET_MIN_POP) || null;
}

/** The note for what's coming: 'Rain in next hour', or Snow or Storms. */
export function wetNote(code) {
  const kind = describe(code, true).icon;
  return (kind === '#w-snow' ? 'Snow' : kind === '#w-thunder' ? 'Storms' : 'Rain') + ' in next hour';
}

/**
 * check(weather, now) returns the note (see wetNote) the moment rain or snow becomes due (see
 * wetSoon), and not again until it has passed or the forecast has dropped it, else ''. The first
 * reading only sets the baseline.
 */
export function weatherWatch() {
  let was = null;
  return function check(weather, now) {
    if (!weather || weather.status !== 'ok') return '';
    const soon = wetSoon(weather, now);
    const fire = was === false && soon;
    was = !!soon;
    return fire ? wetNote(soon.code) : '';
  };
}

// A countdown you started comes up this long before it ends.
export const TIMER_LEAD_MS = 60000;

/**
 * check(countdowns, now), with countdowns the ones you started that are running ({ id, endsAt }),
 * returns the one that has just come within TIMER_LEAD_MS of its end, else null. Each comes up
 * once, and only if it was seen with more than that left (one started with less, or first seen
 * after a page load in its last minute, is left be).
 */
export function timerWatch() {
  const seen = {}; // id → 'early' (more than the lead left when seen), 'done' (came up, or never will)
  return function check(countdowns, now) {
    const live = {};
    let due = null;
    (countdowns || []).forEach(c => {
      live[c.id] = true;
      const left = c.endsAt - now;
      if (left > TIMER_LEAD_MS) { if (!seen[c.id]) seen[c.id] = 'early'; return; }
      if (seen[c.id] !== 'early' || left <= 0) seen[c.id] = 'done';
      else if (!due || c.endsAt < due.endsAt) due = c; // two at once: the one ending first, the other next second
    });
    if (due) seen[due.id] = 'done';
    // A paused timer drops out and comes back with a new end: it can come up again then.
    Object.keys(seen).forEach(id => { if (!live[id]) delete seen[id]; });
    return due;
  };
}
