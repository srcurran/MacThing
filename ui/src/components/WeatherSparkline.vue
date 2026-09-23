<script>
// Counted across instances, so each chart's clip paths get their own ids.
let instances = 0;
</script>
<script setup>
import { computed } from "vue";
// One of the Today view's day-long sparklines: a 2px line through the hours, the hours already
// gone dimmed, and a dot on the line at the current time. `area` also fills under the line.
const props = defineProps({
  values: Array, // one per hour, midnight first
  min: Number,
  max: Number,
  now: Number, // how far through the day, 0 to 1 (outside that, no dot)
  area: Boolean,
  width: { type: Number, default: 392 }, // the stage's safe width
  height: { type: Number, default: 56 },
});
const PAD = 7; // room for the dot and its ring at the top and bottom
const id = "w-spark-" + ++instances;
const geometry = computed(() => {
  const n = props.values.length;
  const span = Math.max(1, props.max - props.min);
  const x = (i) => (i / (n - 1)) * props.width;
  const y = (v) =>
    PAD + (1 - (v - props.min) / span) * (props.height - PAD * 2);
  const points = props.values.map((v, i) => [x(i), y(v)]);
  const line = points
    .map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join("");
  const floor = props.height - PAD;
  const fill = line + "L" + props.width + " " + floor + "L0 " + floor + "Z";
  let dot = null;
  if (props.now >= 0 && props.now <= 1) {
    const at = props.now * (n - 1),
      i = Math.min(n - 2, Math.floor(at)),
      f = at - i;
    dot = {
      x: props.now * props.width,
      y: points[i][1] + (points[i + 1][1] - points[i][1]) * f,
    };
  }
  return { line, fill, dot };
});
// 6 AM, noon and 6 PM, so the line reads against the time of day.
const grid = computed(() =>
  [6, 12, 18].map((h) => (h / (props.values.length - 1)) * props.width),
);
</script>
<template>
  <svg
    class="w-spark"
    :class="{ area }"
    :width="width"
    :height="height"
    :viewBox="'0 0 ' + width + ' ' + height"
  >
    <defs v-if="geometry.dot">
      <clipPath :id="id + '-past'">
        <rect :width="geometry.dot.x" :height="height" />
      </clipPath>
      <clipPath :id="id + '-ahead'">
        <rect :x="geometry.dot.x" :width="width" :height="height" />
      </clipPath>
    </defs>
    <line
      v-for="x in grid"
      :key="x"
      class="w-spark-grid"
      :x1="x"
      :x2="x"
      y1="0"
      :y2="height"
    />
    <template v-if="geometry.dot">
      <g class="past" :clip-path="'url(#' + id + '-past)'">
        <path v-if="area" class="w-spark-fill" :d="geometry.fill" />
        <path class="w-spark-line" :d="geometry.line" />
      </g>
      <g :clip-path="'url(#' + id + '-ahead)'">
        <path v-if="area" class="w-spark-fill" :d="geometry.fill" />
        <path class="w-spark-line" :d="geometry.line" />
      </g>
      <circle
        class="w-spark-now"
        :cx="geometry.dot.x"
        :cy="geometry.dot.y"
        r="5"
      />
    </template>
    <template v-else>
      <path v-if="area" class="w-spark-fill" :d="geometry.fill" />
      <path class="w-spark-line" :d="geometry.line" />
    </template>
  </svg>
</template>
