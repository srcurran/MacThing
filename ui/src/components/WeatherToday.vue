<script setup>
import { computed } from "vue";
import { CT } from "../state.js";
import { describe } from "../weather.js";
import WeatherIcon from "./WeatherIcon.vue";
import WeatherSparkline from "./WeatherSparkline.vue";
// Today at a glance (the weather button again): the day's forecast as a big icon, then its
// temperature and chance of rain hour by hour, with a dot at the current time on each.
const props = defineProps({ weather: Object, now: Number });
const tz = computed(() => props.weather.utcOffset / 60);
const day = computed(() => props.weather.daily[0]);
const today = computed(() => props.weather.today || {});
const hours = computed(() => today.value.hours || []);
const temps = computed(() => hours.value.map((h) => h.temp));
const pops = computed(() => hours.value.map((h) => h.pop));
const lo = computed(() => Math.min(...temps.value));
const hi = computed(() => Math.max(...temps.value));
const wettest = computed(() => Math.max(...pops.value));
const through = computed(() => {
  const list = hours.value;
  if (list.length < 2) return -1;
  const start = list[0].t,
    last = list[list.length - 1].t;
  if (props.now < start || props.now >= start + 86400000) return -1;
  return Math.min(1, (props.now - start) / (last - start));
});
// Under the rain chart, lined up with its 6 AM, noon and 6 PM gridlines.
const axis = computed(() =>
  hours.value.length < 19
    ? []
    : [6, 12, 18].map((h) => ({
        label: CT.hourText(hours.value[h].t, tz.value),
        left: (h / (hours.value.length - 1)) * 100 + "%",
      })),
);
</script>
<template>
  <div class="w-today flex-col justify-between">
    <div class="flex items-center gap-24">
      <WeatherIcon class="w-today-icon flex-none" :code="day.code" />
      <div class="flex-1 flex-col">
        <div class="font-medium semibold truncate">
          {{ describe(day.code, true).label }}
        </div>
        <div class="font-small medium tabular">
          {{ day.hi }}° <span class="muted">/ {{ day.lo }}°</span>
        </div>
        <div v-if="today.sunset" class="font-small medium muted truncate">
          Sunset {{ CT.timeText(today.sunset, tz) }}
        </div>
      </div>
    </div>
    <template v-if="hours.length > 1">
      <div class="flex-col gap-8">
        <div class="flex justify-between font-small medium">
          <span class="secondary">Temperature</span
          ><span class="tabular">{{ lo }}° – {{ hi }}°</span>
        </div>
        <WeatherSparkline :values="temps" :min="lo" :max="hi" :now="through" />
      </div>
      <div class="flex-col gap-8">
        <div class="flex justify-between font-small medium">
          <span class="secondary">Rain</span
          ><span class="tabular">{{
            wettest ? "Up to " + wettest + "%" : "None"
          }}</span>
        </div>
        <WeatherSparkline
          class="w-spark-rain"
          :values="pops"
          :min="0"
          :max="100"
          :now="through"
          area
        />
        <div class="w-axis font-small medium muted">
          <span v-for="a in axis" :key="a.label" :style="{ left: a.left }">{{
            a.label
          }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
