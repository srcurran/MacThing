<script setup>
import { computed } from "vue";
import { CT } from "../state.js";
import WeatherIcon from "./WeatherIcon.vue";
// This Week (the weather button a third time): six days as rows (Figma 165:1805). Each row: the day, its icon, and its low to high on a bar scaled to the week.
const props = defineProps({ days: Array, tz: Number });
const rows = computed(() => {
  const min = Math.min(...props.days.map((d) => d.lo)),
    max = Math.max(...props.days.map((d) => d.hi)),
    span = Math.max(1, max - min);
  return props.days.map((d) => ({
    ...d,
    range: {
      left: ((d.lo - min) / span) * 100 + "%",
      right: ((max - d.hi) / span) * 100 + "%",
    },
  }));
});
</script>
<template>
  <div class="w-rows w-week flex-col">
    <div
      v-for="d in rows"
      :key="d.t"
      class="w-row flex items-center gap-24 font-small semibold"
    >
      <div class="w-row-day">{{ CT.DAYS[CT.parts(d.t, tz).day].slice(0, 3) }}</div>
      <WeatherIcon class="flex-none" :code="d.code" />
      <div class="w-week-temps flex-1 flex items-center gap-8">
        <div class="w-row-temp text-right tabular regular muted">{{ d.lo }}°</div>
        <div class="w-week-range flex-1"><i :style="d.range" /></div>
        <div class="w-row-temp text-right tabular">{{ d.hi }}°</div>
      </div>
    </div>
  </div>
</template>
