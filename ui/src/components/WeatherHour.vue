<script setup>
import WeatherIcon from './WeatherIcon.vue';
defineProps({ label: String, forecast: Object, current: Boolean });
</script>
<template>
  <div class="flex-col items-center gap-8 font-small semibold">
    <div :class="{ secondary: !current }">{{ label }}</div>
    <WeatherIcon :code="forecast.code" :is-day="!!forecast.isDay" />
    <div>{{ forecast.temp }}°</div><div class="w-pop">{{ forecast.pop >= 20 ? forecast.pop + '%' : '' }}</div>
  </div>
</template>
