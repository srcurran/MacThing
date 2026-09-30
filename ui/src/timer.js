import { reactive, computed, watch } from 'vue';
import { state, CT } from './state.js';

// The Time Timer on the clock screen. It keeps its end time on the Mac's clock rather than
// counting seconds, so it stays right while another screen is up or the backlight is off.
export const PRESETS = [5, 10, 15, 30, 45, 60]; // minutes
// meeting, when set, is the timer's other length: until the meeting going on now ends.
export const timer = reactive({ preset: 2, meeting: null, status: 'set', endsAt: 0, left: 0 }); // status: set | running | paused | done

const keyOf = e => (e.calendarId || '') + '|' + e.start + '|' + (e.title || '');
/** The timed event going on now, or null. With a few at once, the one that ends first. */
export const currentMeeting = computed(() => {
  if (state.calendar.status !== 'ok') return null;
  const on = state.calendar.events.filter(e => !e.allDay && e.start <= state.now && state.now < e.end);
  return on.length ? on.reduce((a, b) => (b.end < a.end ? b : a)) : null;
});
/** Which meeting is on, as a key: it changes only when a different one starts (or none is on). */
export const currentMeetingKey = computed(() => currentMeeting.value ? keyOf(currentMeeting.value) : '');
const meetingOf = e => ({ key: keyOf(e), title: e.title || '', start: e.start, end: e.end });

const presetMs = () => PRESETS[timer.preset] * 60000;
/** The timer's full turn: the preset, or the whole meeting (so the dial shows how much is left). */
export const total = computed(() => timer.meeting ? timer.meeting.end - timer.meeting.start : presetMs());
export const remaining = computed(() => {
  if (timer.status === 'set') return timer.meeting ? Math.max(0, timer.meeting.end - state.now) : presetMs();
  if (timer.status === 'running') return Math.max(0, timer.endsAt - state.now);
  return timer.left;
});
export const timerLabel = computed(() => {
  const minutes = PRESETS[timer.preset];
  const name = timer.meeting ? 'Until ' + (timer.meeting.title || 'the meeting') + ' ends'
    : minutes === 60 ? '1 hour timer' : minutes + ' minute timer';
  return timer.status === 'paused' ? name + ' · Paused' : timer.status === 'done' ? "Time's up" : name;
});
/** 35:23 — whole seconds, rounded down. */
export function timerText(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
/** Set, it shows the full length, 5:00. Started, it drops to 4:59 straight away so you can see
 *  it going, and reads 0:00 through its last second. Once the time is up it counts on past it,
 *  1:23+, until the timer's put away. Set to a meeting, it's already counting down to its end. */
export const timerTitle = computed(() =>
  timer.status === 'set' ? timerText(remaining.value)
    : timer.status === 'done' ? timerText(state.now - timer.endsAt) + '+'
    : timerText(Math.ceil(remaining.value / 1000) * 1000 - 1000));

/** The knob's stops are the meeting's end, while there's a meeting on, then the presets. */
export function stepPreset(steps) {
  const first = currentMeeting.value ? -1 : 0;
  const at = Math.max(first, Math.min(PRESETS.length - 1, (timer.meeting ? -1 : timer.preset) + steps));
  if (at < 0) timer.meeting = meetingOf(currentMeeting.value);
  else { timer.meeting = null; timer.preset = at; }
  timer.status = 'set';
}
/** Opening the timer during a meeting sets it to the meeting's end, unless it's already going. */
export function pickMeeting() {
  if (timer.status === 'set' && currentMeeting.value) timer.meeting = meetingOf(currentMeeting.value);
}
/** Settings → Meeting timer: starts the timer on the meeting going on now, unless it's already
 *  running or paused on something else. True if it did. Back to back, the next meeting starts
 *  the moment the last one's timer runs out, maybe before the second's tick has said so. */
export function autoStartMeeting() {
  if (!state.settings.meetingTimer || !currentMeeting.value) return false;
  if (timer.status === 'running' && timer.endsAt <= state.now) finish();
  if (timer.status === 'running' || timer.status === 'paused') return false;
  timer.meeting = meetingOf(currentMeeting.value);
  timer.status = 'set';
  toggleTimer();
  return true;
}
export function toggleTimer() {
  state.now = CT.now();
  if (timer.status === 'running') {
    timer.left = Math.max(0, timer.endsAt - state.now);
    timer.status = 'paused';
  } else if (timer.status === 'done') resetTimer();
  else {
    timer.endsAt = endOnHalfSecond(timer.status === 'paused' ? state.now + timer.left
      : timer.meeting ? timer.meeting.end : state.now + presetMs());
    timer.status = 'running';
  }
}
// The display only redraws on the shared tick, just after each of the Mac's whole seconds. If the
// timer's own seconds rolled over near that moment, the tick's jitter would decide which side it
// read — some seconds would show twice and others not at all. So the end is pulled back (never
// forward, so it still reads 4:59 the moment it starts) to half a second off the tick.
function endOnHalfSecond(ms) {
  return ms - ((ms - 505) % 1000 + 1000) % 1000;
}
export function resetTimer() {
  timer.status = 'set';
  if (timer.meeting) followMeeting();
}
/** Pressed twice: stop the timer and put it back to its preset. Set to a meeting, it's always
 *  counting down to the meeting's end, so reset leaves the meeting too; the knob's meeting stop
 *  (or opening the timer again) brings it back. */
export function clearTimer() {
  timer.meeting = null;
  timer.status = 'set';
}
// Set to a meeting, the timer keeps up with it: a new end time, or, once it's over (or moved, or
// gone from the calendar), back to its preset.
function followMeeting() {
  const e = currentMeeting.value;
  timer.meeting = e && keyOf(e) === timer.meeting.key ? meetingOf(e) : null;
}
watch(currentMeeting, () => { if (timer.meeting && timer.status === 'set') followMeeting(); });
// Running on a meeting, it follows the meeting's end if that changes — unless it's been paused,
// when it's the timer's own time from then on.
watch(() => state.calendar, () => {
  if (!timer.meeting || timer.status !== 'running' || state.calendar.status !== 'ok') return;
  const e = state.calendar.events.find(e => !e.allDay && keyOf(e) === timer.meeting.key);
  if (!e || e.end === timer.meeting.end || e.end <= state.now) return;
  timer.meeting = meetingOf(e);
  timer.endsAt = endOnHalfSecond(e.end);
});

function finish() {
  timer.status = 'done';
  timer.left = 0;
  CT.flash('timer', 'var(--orange)');
}
CT.onSecond(now => { if (timer.status === 'running' && now >= timer.endsAt) finish(); });
