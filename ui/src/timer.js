import { reactive, computed } from 'vue';
import { state, CT } from './state.js';

// The Time Timer on the clock screen. It keeps its end time on the Mac's clock rather than
// counting seconds, so it stays right while another screen is up or the backlight is off.
export const PRESETS = [5, 10, 15, 30, 45, 60]; // minutes
export const timer = reactive({ preset: 2, status: 'set', endsAt: 0, left: 0 }); // status: set | running | paused | done

const presetMs = () => PRESETS[timer.preset] * 60000;
export const remaining = computed(() => {
  if (timer.status === 'set') return presetMs();
  if (timer.status === 'running') return Math.max(0, timer.endsAt - state.now);
  return timer.left;
});
export const timerLabel = computed(() => {
  const minutes = PRESETS[timer.preset];
  const name = minutes === 60 ? '1 hour timer' : minutes + ' minute timer';
  return timer.status === 'paused' ? name + ' · Paused' : timer.status === 'done' ? "Time's up" : name;
});
/** 35:23 — whole seconds, rounded down. */
export function timerText(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
/** Set, it shows the full length, 5:00. Started, it drops to 4:59 straight away so you can see
 *  it going, and reads 0:00 through its last second. Once the time is up it counts on past it,
 *  1:23+, until the timer's put away. */
export const timerTitle = computed(() =>
  timer.status === 'set' ? timerText(remaining.value)
    : timer.status === 'done' ? timerText(state.now - timer.endsAt) + '+'
    : timerText(Math.ceil(remaining.value / 1000) * 1000 - 1000));

export function stepPreset(steps) {
  timer.preset = Math.max(0, Math.min(PRESETS.length - 1, timer.preset + steps));
  timer.status = 'set';
}
export function toggleTimer() {
  state.now = CT.now();
  if (timer.status === 'running') {
    timer.left = Math.max(0, timer.endsAt - state.now);
    timer.status = 'paused';
  } else if (timer.status === 'done') resetTimer();
  else {
    timer.endsAt = endOnHalfSecond(state.now + (timer.status === 'paused' ? timer.left : presetMs()));
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
export function resetTimer() { timer.status = 'set'; }

CT.onSecond(now => {
  if (timer.status !== 'running' || now < timer.endsAt) return;
  timer.status = 'done';
  timer.left = 0;
  CT.flash('timer', 'var(--orange)');
});
