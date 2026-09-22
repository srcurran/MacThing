<script setup>
import { computed } from 'vue';
import { state, CT } from '../state.js';
import LeftRail from '../components/LeftRail.vue';
import ScreenStage from '../components/ScreenStage.vue';
import AnalogClock from '../components/AnalogClock.vue';
const parts = computed(() => CT.parts(state.now));
const face = computed(() => state.settings.clockFace);
const time = computed(() => CT.clockText(parts.value));
const next = computed(() => state.calendar.status === 'ok' ? state.calendar.events.find(e => !e.allDay && e.start > state.now && CT.dayNumber(e.start) === CT.dayNumber(state.now)) : null);
CT.screen('clock');
</script>
<template>
  <section id="screen-clock" class="screen fill flex" :class="{ active: state.current === 'clock' }">
    <LeftRail :eyebrow="CT.MONTHS[parts.month]" :title="parts.date" accent :subtitle="CT.DAYS[parts.day]">
      <template #lower>
        <template v-if="next">{{ CT.timeText(next.start) }} <b class="primary medium">{{ next.title }}</b></template><template v-else-if="state.calendar.status === 'ok'">No events today</template>
      </template>
    </LeftRail>
    <ScreenStage class="bg-panel">
      <AnalogClock v-if="face !== 'digital'" :numbers="face === 'numbers'" :now="state.current === 'clock' ? state.now : 0" />
      <div v-else class="c-digital fill flex tabular semibold"><span>{{ time.time }}</span><span class="c-digital-sec accent">{{ String(parts.seconds).padStart(2, '0') }}</span></div>
    </ScreenStage>
  </section>
</template>
