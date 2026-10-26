<script setup>
import TimeTimer from './TimeTimer.vue';
import { PRESETS } from '../timer.js';
// The timer's overview, over the whole clock screen (Figma: time timer → "Timer deck · no
// timers"). In the rail's column, "Set a timer" and the presets, spread down to the page's bottom
// inset. In the stage's square, the cards in a row: each is the full-size timer itself (its rail
// and dial) at 0.8, 640 × 384, inside the square's padding; only the one in focus is on screen,
// the next running off its right edge. The ones before it slide out of sight behind the rail's
// column. Tapping a preset starts a timer; tapping a card focuses it (ClockScreen.vue decides the
// rest). clock is the time of day and next the next event, as the full-size timer's rail shows.
// Each step along the row is a card's width and the gap after it (.td-card in app.css).
const STEP = 672;
defineProps({ cards: Array, focus: Number, on: Boolean, zooming: Boolean, clock: String, next: Object });
defineEmits(['start', 'pick']);
</script>
<template>
  <div class="td fill" :class="{ on, zooming }">
    <div class="td-set">
      <p class="font-small bold">Set a timer</p>
      <div class="td-presets">
        <div v-for="m in PRESETS" :key="m" class="td-preset" @click="$emit('start', m)"><span class="font-medium semibold tabular">{{ m }}</span><span class="td-unit bold muted">MIN</span></div>
      </div>
    </div>
    <div class="td-cards"><div class="td-row" :style="{ transform: 'translateX(' + -focus * STEP + 'px)' }">
      <div v-for="(c, i) in cards" :key="c.id" class="td-card" :class="{ focus: i === focus }" :style="{ left: 24 + i * STEP + 'px' }" :data-card="c.id" @click="$emit('pick', c.id)">
        <div class="td-screen">
          <div class="td-rail flex-col justify-between">
            <div class="flex-col">
              <p class="td-label font-small bold truncate">{{ c.label }}</p>
              <h2 class="td-time font-huge tabular">{{ c.title }}</h2>
              <div class="font-medium semibold">{{ clock }}</div>
            </div>
            <div class="font-small medium truncate"><template v-if="next"><span class="muted">{{ next.time }}</span> {{ next.title }}</template><span v-else class="muted">No events today</span></div>
          </div>
          <div class="td-stage"><TimeTimer :remaining="c.remaining" :total="c.total" :idle="c.status === 'set'" /></div>
        </div>
      </div>
    </div></div>
  </div>
</template>
