<script setup>
import { computed } from "vue";
import { CT } from "../state.js";
import WeatherIcon from "./WeatherIcon.vue";
// Today (the weather button again): the next five hours as rows, spread down the stage's insets
// (Figma 202:1565). Each row: the hour, its icon and chance of rain when it's worth mentioning,
// and its temperature riding a bar scaled to the whole day's low to high (stretched if an hour
// past midnight goes beyond it).
const props = defineProps({ hours: Array, day: Object, tz: Number });
const rows = computed(() => {
  const temps = props.hours.map((h) => h.temp),
    min = Math.min(props.day.lo, ...temps),
    span = Math.max(1, Math.max(props.day.hi, ...temps) - min);
  return props.hours.map((h) => ({ ...h, at: (h.temp - min) / span }));
});
</script>
<template>
  <div class="w-rows w-today flex-col justify-between">
    <div
      v-for="h in rows"
      :key="h.t"
      class="w-row flex items-center gap-24 font-small semibold"
    >
      <div class="w-row-day">{{ CT.hourText(h.t, tz) }}</div>
      <div class="w-today-forecast flex-none flex items-center gap-8">
        <WeatherIcon class="flex-none" :code="h.code" :is-day="!!h.isDay" />
        <div v-if="h.pop >= 20" class="w-row-pop w-pop">{{ h.pop }}%</div>
      </div>
      <div class="w-today-range flex-1 flex items-center">
        <i v-if="h.at > 0" class="w-today-line" :style="{ flexGrow: h.at }" />
        <div class="w-today-temp text-right tabular">{{ h.temp }}°</div>
        <i v-if="h.at < 1" class="w-today-line" :style="{ flexGrow: 1 - h.at }" />
      </div>
    </div>
  </div>
</template>
