<script setup>
import { computed } from 'vue';
import { CT } from '../state.js';
const props = defineProps({ now: Number, numbers: Boolean });
function point(r, turns) {
  const angle = turns * 2 * Math.PI;
  return { x: 200 + r * Math.sin(angle), y: 200 - r * Math.cos(angle) };
}
const ticks = Array.from({ length: 60 }, (_, i) => ({ a: point(176, i / 60), b: point(186, i / 60) }));
const numerals = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, ...point(144, (i + 1) / 12) }));
// Screens pass now = 0 while they're not on screen, so the clock stops redrawing. It holds its
// last time instead of drawing 0, so the hands stay put while the screen fades out.
let shown = 0;
const angles = computed(() => {
  if (props.now) shown = props.now;
  const p = CT.parts(shown);
  const minutes = p.minutes + p.seconds / 60;
  return { hour: ((p.hours % 12) + minutes / 60) * 30, minute: minutes * 6 };
});
</script>
<template>
  <svg class="c-face" viewBox="0 0 400 400" aria-label="Analog clock">
    <g><line v-for="(tick, i) in ticks" :key="i" :x1="tick.a.x" :y1="tick.a.y" :x2="tick.b.x" :y2="tick.b.y" class="c-tick" :class="{ hour: i % 5 === 0 }" /></g>
    <g v-if="!numbers">
      <g v-for="i in 12" :key="i" :transform="'rotate(' + (i - 1) * 30 + ' 200 200)'">
        <polygon v-if="i === 1" class="c-mark" points="184.33,43.5 215.67,43.5 200,81.08" />
        <rect v-else-if="(i - 1) % 3 === 0" class="c-mark" x="192.92" y="44.5" width="14.17" height="37.67" rx="1" />
        <circle v-else class="c-mark" cx="200" cy="55" r="10.25" />
      </g>
    </g>
    <g v-else class="c-numerals"><text v-for="n in numerals" :key="n.n" :x="n.x" :y="n.y + 12" text-anchor="middle">{{ n.n }}</text></g>
    <!-- Preserve the Figma vectors and their built-in pivot alignment. -->
    <g :transform="'rotate(' + angles.hour + ' 200 200)'"><image href="images/clock-hour-hand.svg" x="189.75" y="60.19" width="20.5" height="150.06" preserveAspectRatio="none" /></g>
    <g :transform="'rotate(' + angles.minute + ' 200 200)'"><image href="images/clock-minute-hand.svg" x="189.75" y="18.37" width="20.5" height="191.88" preserveAspectRatio="none" /></g>
  </svg>
</template>
