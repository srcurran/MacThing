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
/** 35:23 — the running second rounds up, so it reads 0:00 only once the time is up. */
export function timerText(ms) {
  const s = Math.ceil(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

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
    timer.endsAt = state.now + (timer.status === 'paused' ? timer.left : presetMs());
    timer.status = 'running';
  }
}
export function resetTimer() { timer.status = 'set'; }

CT.onSecond(now => {
  if (timer.status !== 'running' || now < timer.endsAt) return;
  timer.status = 'done';
  timer.left = 0;
  CT.flash('timer', 'var(--orange)');
});
