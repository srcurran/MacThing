import { reactive, computed, ref } from 'vue';
import { state, CT } from './state.js';

// The timers on the clock screen, as cards in a row (ClockScreen.vue, TimerDeck.vue). Any number
// run at once: each preset you tap starts another. Beside them, a card for each meeting going on
// (counting to its end), one for the next meeting today (counting to its start), and, always,
// one that starts the last length used again (30 minutes until you've used one).
// Each timer keeps its end time on the Mac's clock rather than counting seconds, so it stays right
// while another screen is up or the backlight is off, and they're kept across page reloads.
export const PRESETS = [5, 10, 15, 30, 45, 60]; // minutes
const STORE = 'ct-timers', LAST_STORE = 'ct-timer-last';
const DEFAULT_MINUTES = 30;
// A finished timer counts on past its end for ten minutes at most, then puts itself away.
const OVERRUN_MS = 10 * 60000;

function load(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value == null ? fallback : value;
  } catch (e) { return fallback; }
}
const validTimer = t => t && typeof t.id === 'string' && t.minutes > 0 && /^(running|paused|done)$/.test(t.status);
/** Timers you've started, in the order you started them: { id, minutes, status, endsAt, left }.
 *  status: running | paused | done. left is the time left when it was paused. */
export const timers = reactive([].concat(load(STORE, [])).filter(validTimer));
const lastMinutes = ref(PRESETS.includes(load(LAST_STORE, 0)) ? load(LAST_STORE, 0) : DEFAULT_MINUTES);
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(timers));
    localStorage.setItem(LAST_STORE, JSON.stringify(lastMinutes.value));
  } catch (e) {}
}
/** The timer is up on the clock screen (ClockScreen.vue keeps this). */
export const timerOnScreen = ref(false);
/** Something on the timer wants watching: a timer running, paused or just finished, or the timer
 *  up on screen (a meeting's countdown, say), so smart switching and When idle leave it be. */
export const timerBusy = computed(() => timers.length > 0 || timerOnScreen.value);

// From 90 minutes up, a time reads in whole hours, rounded up: 21 hr for 20:37:28. Under that
// it's minutes and seconds, 89:59.
const HOURS_FROM_MS = 90 * 60000;
/** 35:23 — whole seconds, rounded down; from 90 minutes, "21 hr". */
export function timerText(ms) {
  if (ms >= HOURS_FROM_MS) return Math.ceil(ms / 3600000) + ' hr';
  const s = Math.floor(Math.max(0, ms) / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
/** A length in whole minutes, as the meeting alert offers it: "30 min", or from 90 minutes "21 hr". */
export function minutesText(minutes) {
  return minutes * 60000 >= HOURS_FROM_MS ? Math.ceil(minutes / 60) + ' hr' : minutes + ' min';
}
// Counting down, it drops a second straight away (5:00 → 4:59) so you can see it going, and reads
// 0:00 through its last second.
const countdownText = ms => timerText(Math.max(0, Math.ceil(ms / 1000) * 1000 - 1000));
const lengthLabel = minutes => (minutes === 60 ? '1 hour timer' : minutes + ' minute timer');

const keyOf = e => (e.calendarId || '') + '|' + e.start + '|' + (e.title || '');
/** The card for a meeting going on: its id, for the meeting alert to bring it up. */
export const meetingCardId = e => 'end|' + keyOf(e);
const timed = computed(() => (state.calendar.status === 'ok' ? state.calendar.events.filter(e => !e.allDay) : []));
// Meeting cards you've removed (swiped up, Remove), each until its countdown would have ended:
// card id → when. Kept across page reloads.
const HIDDEN_STORE = 'ct-timer-hidden';
const hidden = reactive(load(HIDDEN_STORE, {}));
const shown = (id, until) => !(hidden[id] >= until);
/** The timed events going on now, the one that ends first first. */
const currentMeetings = computed(() => timed.value.filter(e => e.start <= state.now && state.now < e.end)
  .sort((a, b) => a.end - b.end || a.start - b.start));
/** The next timed event still to start today, or null. */
const nextMeeting = computed(() => {
  const today = CT.dayNumber(state.now);
  const later = timed.value.filter(e => e.start > state.now && CT.dayNumber(e.start) === today);
  return later.length ? later.reduce((a, b) => (b.start < a.start ? b : a)) : null;
});
// Counting to the next meeting's start, the dial's full turn is the time there was when its card
// first came up (so it empties as the meeting nears), an hour at least.
const nextSeen = {};

function timerCard(t) {
  const now = state.now, total = t.minutes * 60000;
  const remaining = t.status === 'running' ? Math.max(0, t.endsAt - now) : t.status === 'paused' ? t.left : 0;
  const name = lengthLabel(t.minutes);
  return {
    id: t.id, kind: 'timer', status: t.status, remaining, total,
    // Paused goes first, so a long label cut short doesn't take it with it.
    label: t.status === 'paused' ? 'Paused · ' + name : t.status === 'done' ? "Time's up" : name,
    // Once the time is up it counts on past it, 1:23+, until it's put away.
    title: t.status === 'done' ? timerText(now - t.endsAt) + '+' : t.status === 'paused' ? countdownText(t.left) : countdownText(remaining)
  };
}
/** Every card, left to right: the meetings, your timers (newest first), then the last length used. */
export const cards = computed(() => {
  const now = state.now, list = [];
  currentMeetings.value.filter(e => shown(meetingCardId(e), e.end)).forEach(e => list.push({
    id: meetingCardId(e), kind: 'meeting', status: 'running', remaining: e.end - now, total: e.end - e.start,
    label: e.title || 'Meeting ends in', title: countdownText(e.end - now)
  }));
  const next = nextMeeting.value;
  if (next && shown('start|' + keyOf(next), next.start)) {
    const id = 'start|' + keyOf(next);
    nextSeen[id] = nextSeen[id] || now;
    list.push({
      id, kind: 'meeting', status: 'running', remaining: next.start - now, total: Math.max(3600000, next.start - nextSeen[id]),
      label: 'Next meeting in', title: countdownText(next.start - now)
    });
  }
  timers.forEach(t => list.push(timerCard(t)));
  const minutes = lastMinutes.value;
  list.push({ id: 'last', kind: 'last', status: 'set', remaining: minutes * 60000, total: minutes * 60000,
    label: lengthLabel(minutes), title: timerText(minutes * 60000) });
  return list;
});

/** Starts a new timer of that many minutes, ahead of any already going, so its card goes in by
 *  the presets and the deck only has to move one step to it. Returns its card's id. */
export function startTimer(minutes) {
  state.now = CT.now();
  const id = 't' + state.now.toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  timers.unshift({ id, minutes, status: 'running', endsAt: endOnHalfSecond(state.now + minutes * 60000), left: 0 });
  lastMinutes.value = minutes;
  save();
  return id;
}
/** The knob on a timer: pause it, start it again, or put a finished one away. */
export function toggleTimer(id) {
  const t = timers.find(t => t.id === id);
  if (!t) return;
  state.now = CT.now();
  if (t.status === 'running') {
    t.left = Math.max(0, t.endsAt - state.now);
    t.status = 'paused';
  } else if (t.status === 'paused') {
    t.endsAt = endOnHalfSecond(state.now + t.left);
    t.status = 'running';
  } else return removeTimer(id);
  save();
}
export function removeTimer(id) {
  const i = timers.findIndex(t => t.id === id);
  if (i >= 0) timers.splice(i, 1);
  save();
}
/** Removes a card (swiped up, Remove): a timer is put away, a meeting's countdown hidden until
 *  it would have ended. The last length used always stays. */
export function removeCard(card) {
  if (card.kind === 'timer') return removeTimer(card.id);
  if (card.kind !== 'meeting') return;
  hidden[card.id] = state.now + card.remaining;
  Object.keys(hidden).forEach(id => { if (hidden[id] < state.now) delete hidden[id]; });
  try { localStorage.setItem(HIDDEN_STORE, JSON.stringify(hidden)); } catch (e) {}
}
/** Puts away every timer that's finished (leaving the timer does this). */
export function removeDoneTimers() {
  timers.filter(t => t.status === 'done').forEach(t => removeTimer(t.id));
}
// The display only redraws on the shared tick, just after each of the Mac's whole seconds. If the
// timer's own seconds rolled over near that moment, the tick's jitter would decide which side it
// read — some seconds would show twice and others not at all. So the end is pulled back (never
// forward, so it still reads 4:59 the moment it starts) to half a second off the tick.
function endOnHalfSecond(ms) {
  return ms - ((ms - 505) % 1000 + 1000) % 1000;
}
CT.onSecond(now => {
  let changed = false;
  timers.slice().forEach(t => {
    if (t.status === 'running' && now >= t.endsAt) { t.status = 'done'; t.left = 0; changed = true; }
    if (t.status === 'done' && now - t.endsAt >= OVERRUN_MS) { removeTimer(t.id); changed = true; }
  });
  if (changed) save();
});
