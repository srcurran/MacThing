<script setup>
import { computed } from "vue";
// The timer's dial, drawn across the 480×480 stage (Figma 154:4300). A full turn is the timer's
// length: the white wedge is the time left, clockwise from 12, with a hand on its moving edge,
// and a ring of one dot per minute that go dark as the minutes pass. remaining and total are ms.
const props = defineProps({ remaining: Number, total: Number });
function point(r, degrees) {
  const angle = (degrees * Math.PI) / 180;
  return { x: 240 + r * Math.sin(angle), y: 240 - r * Math.cos(angle) };
}
const degrees = computed(() =>
  props.total
    ? Math.max(0, Math.min(1, props.remaining / props.total)) * 360
    : 0,
);
const wedge = computed(() => {
  const end = point(145, degrees.value);
  return (
    "M240 240V95A145 145 0 " +
    (degrees.value > 180 ? 1 : 0) +
    " 1 " +
    end.x +
    " " +
    end.y +
    "Z"
  );
});
const hand = computed(() => point(145, degrees.value));
const minutes = computed(() => {
  const n = Math.round(props.total / 60000),
    left = Math.ceil(props.remaining / 60000);
  return Array.from({ length: n }, (_, i) => ({
    ...point(175, (i * 360) / n),
    left: i < left,
  }));
});
</script>
<template>
  <svg class="t-face" viewBox="0 0 480 480" aria-label="Timer">
    <circle v-if="degrees >= 360" class="t-left" cx="240" cy="240" r="145" />
    <path v-else-if="degrees > 0" class="t-left" :d="wedge" />
    <circle
      v-for="(m, i) in minutes"
      :key="i"
      :cx="m.x"
      :cy="m.y"
      r="5"
      class="t-minute"
      :class="{ left: m.left }"
    />
    <line class="t-hand" x1="240" y1="240" :x2="hand.x" :y2="hand.y" />
    <circle class="t-hub" cx="240" cy="240" r="17" />
  </svg>
</template>
