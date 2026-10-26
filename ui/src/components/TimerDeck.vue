<script setup>
import TimeTimer from './TimeTimer.vue';
import { PRESETS } from '../timer.js';
// The timer's overview, over the whole clock screen: "Set a timer" and the presets in two columns
// on the left, staying put, then the cards (timer.js's cards) in a row on their own lifted
// backgrounds, to their right. The row slides so the focused card sits beside the presets, with
// only the next one going off the screen's right edge (the ones before it slide out of sight
// behind the presets' column, inside the page's own padding). Tapping a preset starts a timer;
// tapping a card focuses it (ClockScreen.vue decides the rest).
// Each step along the row is a card's width and the gap after it (.td-card in app.css).
const STEP = 440;
defineProps({ cards: Array, focus: Number, on: Boolean, zooming: Boolean });
defineEmits(['start', 'pick']);
</script>
<template>
  <div class="td fill" :class="{ on, zooming }">
    <div class="td-set">
      <p class="font-small bold">Set a timer</p>
      <div class="td-presets">
        <div v-for="m in PRESETS" :key="m" class="td-preset font-medium semibold tabular" @click="$emit('start', m)">{{ m }}</div>
      </div>
    </div>
    <div class="td-cards"><div class="td-row" :style="{ transform: 'translateX(' + -focus * STEP + 'px)' }">
      <div v-for="(c, i) in cards" :key="c.id" class="td-card" :class="{ focus: i === focus }" :style="{ left: i * STEP + 'px' }" :data-card="c.id" @click="$emit('pick', c.id)">
        <div class="td-dial"><TimeTimer :remaining="c.remaining" :total="c.total" :idle="c.status === 'set'" /></div>
        <p class="td-label font-small bold truncate">{{ c.label }}</p>
        <div class="td-time tabular">{{ c.title }}</div>
        <p class="td-note font-small medium muted truncate">{{ c.note }}</p>
      </div>
    </div></div>
  </div>
</template>
