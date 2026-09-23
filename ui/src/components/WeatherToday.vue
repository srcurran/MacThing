<script setup>
import { CT } from "../state.js";
import WeatherIcon from "./WeatherIcon.vue";
// Today (the weather button again): the next six hours as rows, spread down the stage's insets
// (Figma 165:1688). Each row: the hour, its chance of rain when it's worth mentioning, icon, temp.
defineProps({ hours: Array, tz: Number });
</script>
<template>
  <div class="w-rows flex-col justify-between">
    <div
      v-for="h in hours"
      :key="h.t"
      class="w-row flex items-center gap-24 font-small semibold"
    >
      <div class="flex-1 secondary">{{ CT.hourText(h.t, tz) }}</div>
      <div class="w-row-pop w-pop">{{ h.pop >= 20 ? h.pop + "%" : "" }}</div>
      <WeatherIcon class="flex-none" :code="h.code" :is-day="!!h.isDay" />
      <div class="w-row-temp text-right tabular">{{ h.temp }}°</div>
    </div>
  </div>
</template>
