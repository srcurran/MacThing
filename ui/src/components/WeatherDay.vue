<script setup>
import WeatherIcon from './WeatherIcon.vue';
defineProps({ label: String, forecast: Object, current: Boolean });
</script>
<template>
  <div class="w-day font-small semibold">
    <div :class="{ secondary: !current }">{{ label }}</div>
    <div class="w-forecast flex items-center gap-8"><WeatherIcon :code="forecast.code" /><div v-if="forecast.pop >= 20" class="w-pop">{{ forecast.pop }}%</div></div>
    <div class="text-right tabular regular muted">{{ forecast.lo }}°</div><div class="w-range"><i :style="forecast.range" /></div><div class="text-right tabular">{{ forecast.hi }}°</div>
  </div>
</template>
