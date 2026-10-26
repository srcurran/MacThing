<script>
// Where things sit along the deck's stripe (Figma: time timer → "Swiping"), for a position p: 0
// is the presets with the first card beside them in the stage's square (at 344), 1 the first card
// centred (at 80), 2 the second, and so on. In between, everything slides, and the presets' column
// closes up the space after it as it goes, so by 1 the first card is 24px past the presets' edge.
// A card is the full-size timer at 0.8, 640 × 384, with 32px between cards.
export const CARD_W = 640, GAP = 32, STEP = CARD_W + GAP;
const BESIDE = 344, CENTRED = 80, COLUMN = 256; // the presets' column, closed up: 24 + 208 + 24
/** The first card's x at position p. */
export function firstCardAt(p) {
  return p <= 1 ? BESIDE - (BESIDE - CENTRED) * p : CENTRED - (p - 1) * STEP;
}
/** The presets' column's x at position p: from 0 to just clear of the first card, centred. */
function columnAt(p) {
  return p <= 1 ? -(COLUMN - CENTRED) * p : firstCardAt(p) - COLUMN;
}
/** The position at which the first card is at x (firstCardAt, backwards). */
export function positionAt(x) {
  return x >= CENTRED ? (BESIDE - x) / (BESIDE - CENTRED) : 1 + (CENTRED - x) / STEP;
}
</script>
<script setup>
import { computed } from 'vue';
import TimeTimer from './TimeTimer.vue';
import { PRESETS } from '../timer.js';
// The timer's overview, over the whole clock screen (Figma: time timer → "Timer deck · no timers"
// and "Swiping"). One stripe that slides as a whole: "Set a timer" and the presets in the rail's
// column, spread down to the page's bottom inset, then the cards, each the full-size timer itself
// (its rail and dial) at 0.8. It rests with the presets showing, or with a card centred, its
// neighbours peeking in either side; while a finger drags it, it follows (dragging: no easing).
// Tapping a preset starts a timer; tapping a card focuses it (ClockScreen.vue decides the rest).
// clock is the time of day and next the next event, as the full-size timer's rail shows.
const props = defineProps({ cards: Array, focus: Number, position: Number, dragging: Boolean, on: Boolean, zooming: Boolean, clock: String, next: Object });
defineEmits(['start', 'pick']);
const firstCard = computed(() => firstCardAt(props.position));
const column = computed(() => columnAt(props.position));
// Zooming, the card in focus grows from where it sits to the whole screen, where the full-size
// timer is: to x 0, up its 48px inset, and 1.25 (its 0.8 undone).
function cardTransform(i) {
  if (props.zooming && i === props.focus) return 'translate(0px, -48px) scale(1.25)';
  return 'translateX(' + (firstCard.value + i * STEP) + 'px)';
}
</script>
<template>
  <div class="td fill" :class="{ on, zooming, dragging }">
    <div class="td-set" :style="{ transform: 'translateX(' + column + 'px)' }">
      <p class="font-small bold">Set a timer</p>
      <div class="td-presets">
        <div v-for="m in PRESETS" :key="m" class="td-preset" @click="$emit('start', m)"><span class="td-minutes font-medium semibold tabular">{{ m }}</span><span class="td-unit bold muted">MIN</span></div>
      </div>
    </div>
    <div v-for="(c, i) in cards" :key="c.id" class="td-card" :class="{ focus: i === focus }" :style="{ transform: cardTransform(i) }" :data-card="c.id" @click="$emit('pick', c.id)">
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
  </div>
</template>
