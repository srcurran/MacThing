<script setup>
import { computed, ref } from 'vue';
import { state, CT } from '../state.js';
import LeftRail from '../components/LeftRail.vue';
import ScreenStage from '../components/ScreenStage.vue';
import AnalogClock from '../components/AnalogClock.vue';
import TimeTimer from '../components/TimeTimer.vue';
import { PRESETS, timer, remaining, timerLabel, timerText, stepPreset, toggleTimer, resetTimer } from '../timer.js';
const parts = computed(() => CT.parts(state.now));
const face = computed(() => state.settings.clockFace);
const time = computed(() => CT.clockText(parts.value));
const next = computed(() => state.calendar.status === 'ok' ? state.calendar.events.find(e => !e.allDay && e.start > state.now && CT.dayNumber(e.start) === CT.dayNumber(state.now)) : null);
// The clock button, pressed on the clock, swaps it for the timer and back. Knob and wheel work
// the timer only while it's up: turn to pick a length, press to start or pause, press twice to reset.
const mode = ref('clock');
const screen = CT.screen('clock');
screen.reselect = () => { mode.value = mode.value === 'clock' ? 'timer' : 'clock'; };
screen.turn = steps => {
  if (mode.value === 'clock' || timer.status === 'running' || timer.status === 'paused') return false;
  stepPreset(steps);
};
let lastPress = 0;
screen.press = () => {
  if (mode.value === 'clock') return false;
  const t = performance.now();
  if (t - lastPress < (CT.config.multiClickMs || 350)) { resetTimer(); lastPress = 0; } else { toggleTimer(); lastPress = t; }
};
</script>
<template>
  <section id="screen-clock" class="screen fill flex" :class="{ active: state.current === 'clock', leaving: state.leaving === 'clock', timer: mode === 'timer' }">
    <LeftRail v-bind="mode === 'timer' ? { eyebrow: timerLabel, title: timerText(remaining), subtitle: time.time } : { eyebrow: CT.MONTHS[parts.month], title: parts.date, subtitle: CT.DAYS[parts.day] }">
      <template #lower>
        <template v-if="next">{{ CT.timeText(next.start) }} <b class="primary medium">{{ next.title }}</b></template><template v-else-if="state.calendar.status === 'ok'">No events today</template>
      </template>
    </LeftRail>
    <ScreenStage class="bg-panel">
      <TimeTimer v-if="mode === 'timer'" :remaining="remaining" :total="PRESETS[timer.preset] * 60000" />
      <AnalogClock v-else-if="face !== 'digital'" :numbers="face === 'numbers'" :now="state.current === 'clock' ? state.now : 0" />
      <div v-else class="c-digital fill flex tabular semibold"><span>{{ time.time }}</span><span class="c-digital-sec accent">{{ String(parts.seconds).padStart(2, '0') }}</span></div>
    </ScreenStage>
  </section>
</template>
