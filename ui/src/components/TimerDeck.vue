<script>
// Where things sit down the deck's stack, for a position p: 0 is the presets at the top with the
// first card under them, 1 the first card in the middle of the screen (where it rests, at the
// page's 48px inset), 2 the second, and so on; in between, everything slides. A card is the
// full-size timer at 0.8, 640 × 384, centred side to side, with 32px between cards. The presets
// ride along above the first card. Ys are from the cards' resting place, 48px down.
export const CARD_W = 640, CARD_H = 384, GAP = 32, STEP = CARD_H + GAP;
export const CARD_X = (800 - CARD_W) / 2;
const UNDER_PRESETS = 244, CENTRED = 0; // the presets' row, then 96px, then the first card
/** The first card's y at position p. */
export function firstCardAt(p) {
  return p <= 1 ? UNDER_PRESETS - (UNDER_PRESETS - CENTRED) * p : CENTRED - (p - 1) * STEP;
}
/** The presets' y at position p: always just above the first card. */
function presetsAt(p) {
  return firstCardAt(p) - UNDER_PRESETS;
}
/** The position at which the first card is at y (firstCardAt, backwards). */
export function positionAt(y) {
  return y >= CENTRED ? (UNDER_PRESETS - y) / (UNDER_PRESETS - CENTRED) : 1 + (CENTRED - y) / STEP;
}
</script>
<script setup>
import { computed, ref, watch } from 'vue';
import TimeTimer from './TimeTimer.vue';
import PauseDisc from './PauseDisc.vue';
import { PRESETS } from '../timer.js';
// The timer's overview, over the whole clock screen. One stack, top to bottom, that slides up and
// down as a whole: "Set a timer" and the presets in a row, then the cards, each the full-size
// timer itself (its rail and dial) at 0.8. It rests with the presets showing (the first card
// under them), or with a card in the middle, its neighbours peeking in above and below; while a
// finger drags it, it follows (dragging: no easing). Tapping a preset starts a timer; tapping a
// card zooms it up (ClockScreen.vue decides the rest). clock is the time of day and next the next
// event, as the full-size timer's rail shows. lift is how far the card in focus is slid left
// (swiped) off its Remove, which shows as it goes: a red bin and "Remove" in the space it leaves
// (tap it: remove). lifting: a finger has it (no easing).
const LIFT_PX = 160;
const props = defineProps({ cards: Array, focus: Number, position: Number, dragging: Boolean, lift: Number, lifting: Boolean, removing: Boolean, on: Boolean, zooming: Boolean, instant: Boolean, page: Object, clock: String, next: Object });
const emit = defineEmits(['start', 'pick', 'remove']);
// A new timer's card grows out of the preset tapped for it: it starts small and round over the
// preset, then (a frame later, so that's drawn first) the card's own transitions take it to its
// place in the row, as the row slides over to it.
const root = ref(null);
const BORN_SCALE = 0.15; // about the preset's width
let bornFrom = null;
const born = ref(null); // { id, x, y }: the new card's centre, at first, in the deck's coordinates
function startAt(minutes, e) {
  const r = e.currentTarget.getBoundingClientRect(), deck = root.value.getBoundingClientRect();
  bornFrom = { x: r.left - deck.left + r.width / 2, y: r.top - deck.top + r.height / 2 };
  emit('start', minutes);
  requestAnimationFrame(() => { bornFrom = null; }); // the watch below runs after this returns
}
watch(() => props.cards.map(c => c.id), (ids, old) => {
  const id = bornFrom && ids.find(i => !old.includes(i));
  if (!id) return;
  born.value = { id, ...bornFrom };
  bornFrom = null;
  requestAnimationFrame(() => requestAnimationFrame(() => { born.value = null; }));
});
const firstCard = computed(() => firstCardAt(props.position));
const presets = computed(() => presetsAt(props.position));
// Zooming, the card in focus grows from where it sits to the whole screen, where the full-size
// timer is: to x 0, up its 48px inset, and 1.25 (its 0.8 undone).
function cardTransform(i) {
  if (props.zooming && i === props.focus) return 'translate(0px, -48px) scale(1.25)';
  return 'translate(' + (CARD_X - (i === props.focus ? props.lift : 0)) + 'px, ' + (firstCard.value + i * STEP) + 'px)';
}
// Slid aside, the card fades back a little, and Remove shows beside it.
const liftShare = computed(() => Math.min(1, props.lift / LIFT_PX));
const canRemove = computed(() => props.cards[props.focus] && props.cards[props.focus].kind !== 'last');
// Paging between full-size timers (ClockScreen.vue): two cards one over the other, GAP apart, the
// top one full size at t 0 and the bottom one at t 1. In between, both shrink to card size
// (halfway) and grow back, centred side to side, as the gap moves up the screen.
// Full size, a card is square-cornered with no fill, like the full-size timer; it rounds and
// fills in as it shrinks (--fill: the fill's share).
const FULL = 1.25;
const paged = computed(() => {
  const pg = props.page;
  if (!pg) return null;
  const t = pg.dir > 0 ? pg.p : 1 - pg.p;
  const s = FULL - (FULL - 1) * Math.sin(Math.PI * t);
  const h = 384 * s, tx = (800 - CARD_W * s) / 2, gap = 480 + GAP / 2 - t * (480 + GAP);
  const share = (FULL - s) / (FULL - 1);
  // A card sits 48px down the deck (its rail's inset), so its y is taken from there.
  const at = y => ({ transform: 'translate(' + tx + 'px, ' + (y - 48) + 'px) scale(' + s + ')', borderRadius: 24 * share + 'px', '--fill': share });
  const top = pg.dir > 0 ? pg.from : pg.to, bottom = pg.dir > 0 ? pg.to : pg.from;
  const out = {};
  if (top) out[top] = at(gap - GAP / 2 - h);
  if (bottom) out[bottom] = at(gap + GAP / 2);
  return out;
});
function cardStyle(i) {
  const b = born.value;
  if (b && props.cards[i].id === b.id) {
    const card = root.value && root.value.querySelector('.td-card'), top = card ? card.offsetTop : 48;
    return { transform: 'translate(' + (b.x - CARD_W / 2 * BORN_SCALE) + 'px, ' + (b.y - top - 192 * BORN_SCALE) + 'px) scale(' + BORN_SCALE + ')', opacity: 0, borderRadius: '192px' };
  }
  if (paged.value) return paged.value[props.cards[i].id] || {};
  const style = { transform: cardTransform(i) };
  if (i === props.focus && props.lift) style.opacity = 1 - liftShare.value / 2;
  return style;
}
</script>
<template>
  <div ref="root" class="td fill" :class="{ on, zooming, instant, dragging, lifting, paging: !!page }">
    <div v-if="canRemove" class="td-remove flex-col items-center" :style="{ transform: 'translate(' + CARD_X + 'px, ' + (firstCard + focus * STEP) + 'px)', opacity: liftShare }" @click="$emit('remove')">
      <svg class="td-bin" aria-hidden="true"><use href="#i-trash" /></svg>
      <span class="font-medium semibold">Remove</span>
    </div>
    <div class="td-set" :style="{ transform: 'translateY(' + presets + 'px)' }">
      <p class="font-small bold">Set a timer</p>
      <div class="td-presets">
        <div v-for="m in PRESETS" :key="m" class="td-preset" @click="startAt(m, $event)"><span class="td-minutes font-medium semibold tabular">{{ m }}</span><span class="td-unit bold muted">MIN</span></div>
      </div>
    </div>
    <div v-for="(c, i) in cards" :key="c.id" class="td-card" :class="{ focus: i === focus, paged: paged && paged[c.id] }" :style="cardStyle(i)" :data-card="c.id" @click="$emit('pick', c.id)">
      <div class="td-screen">
        <div class="td-rail flex-col justify-between">
          <div class="flex-col">
            <p class="td-label font-small bold truncate">{{ c.label }}</p>
            <h2 class="td-time font-huge tabular">{{ c.title }}</h2>
            <div class="font-medium semibold">{{ clock }}</div>
          </div>
          <div class="font-small medium truncate"><template v-if="next"><span class="muted">{{ next.time }}</span> {{ next.title }}</template><span v-else class="muted">No events today</span></div>
        </div>
        <div class="td-stage"><TimeTimer :remaining="c.remaining" :total="c.total" :idle="c.status === 'set'" /><PauseDisc :paused="c.kind === 'timer' && c.status === 'paused'" /></div>
      </div>
    </div>
  </div>
</template>
