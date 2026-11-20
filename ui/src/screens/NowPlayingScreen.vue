<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { state, CT, elapsed, durationText, artworkUrl, hasArt, calendarCover } from '../state.js';
import LeftRail from '../components/LeftRail.vue';
import ScreenStage from '../components/ScreenStage.vue';
import UiProgress from '../components/UiProgress.vue';
import Artwork from '../components/Artwork.vue';
import PauseDisc from '../components/PauseDisc.vue';
import PlayerPage from '../components/PlayerPage.vue';
import { fitRailTitle } from '../fit-title.js';
const root = ref(null), rail = ref(null);
const np = computed(() => state.np);
const album = computed(() => !np.value.active ? '' : np.value.album || (np.value.kind !== 'music' && np.value.source ? np.value.source.name : '') || '');
// Nothing playing: the perpetual calendar. The rail shows the month, the date and the day, with the
// time where the progress bar goes, and today's cover takes the album art's place (state.js).
// Read to the minute, so the screen isn't redrawn every second for text that changes once a minute.
const minute = computed(() => Math.floor(state.now / 60000));
const parts = computed(() => CT.parts(minute.value * 60000));
const IDLE = computed(() => ({ eyebrow: CT.MONTHS[parts.value.month], title: String(parts.value.date), subtitle: CT.DAYS[parts.value.day] }));
const time = computed(() => CT.clockText(parts.value).time);
const coverUrl = computed(() => calendarCover.value ? calendarCover.value.dataUrl : '');
const stageArt = computed(() => artworkUrl.value || coverUrl.value);
const icon = computed(() => np.value.active && np.value.source ? np.value.source.icon : '');
// Two or more apps with media (Control Center lists them all): {index, count, list} — every
// player's card, in order, and which one this is. The screen pages between them (below).
const players = computed(() => np.value.active && np.value.players && np.value.players.list && np.value.players.list.length > 1 ? np.value.players : null);
const fraction = ref(0);
function updateProgress() { fraction.value = np.value.duration ? elapsed() / np.value.duration : 0; }
function fitTitle() { fitRailTitle(rail.value, np.value.active); }
// Separate sources, so the title is only measured again when one of them changes, not whenever a
// Now Playing message (every 15s, and with each play/pause) replaces state.np.
watch([() => np.value.active, () => np.value.artist, () => np.value.title, album, () => state.current], () => nextTick(fitTitle));
watch(() => [state.np, state.npAt], updateProgress);
// Touch: tapping the media card (the art) plays or pauses, the same as a knob press; a tap
// elsewhere on the screen does nothing. With nothing playing, tapping today's calendar cover has
// the Mac draw a random other one (until tomorrow's). Swiping sideways anywhere on the screen
// skips: left to the next track, right back to the previous one. Up and down, with two or more
// apps with media, it pages between them (below).
let removeGestures;
function gesture(action) { if (state.current === 'nowplaying') CT.tap(action); }
const screen = CT.screen('nowplaying');
screen.show = () => { updateProgress(); nextTick(fitTitle); };

// ---- Paging between players, as between full-size timers (ClockScreen.vue) ---------------------
// Two or more apps with media are a loop: a drag up pages to the next one's Now Playing (down, the
// one before), and past the last comes the first again. The one going shrinks to a card (0.8) and slides off as the next
// comes in under it and grows back to full size; let go past halfway, or flicked, it carries on,
// otherwise it springs back. Still copies of each player's
// screen (PlayerPage.vue) do the moving, over the screen; once landed, the Mac is told which player
// it is, and the copy stays until its Now Playing update has arrived and the art has had time to
// come in underneath. There's no overview: it always rests on one player, full size.
// Now Playing's button pressed again pages to the next one too.
const PAGE_MS = 450, GAP = 32, PAGE_SPAN = 480 + GAP, FLICK_PX_MS = 0.3;
const LAND_SETTLE_MS = 400, LAND_GIVE_UP_MS = 2000;
const page = ref(null); // { from, to, dir, p }: player pids, +1 to the next (finger going up), 0–1
const landing = ref(null); // the pid paged to, until the Mac's update for it is on screen
let pageFrame = 0, pageSettling = false, landTimer = 0;
const cards = computed(() => (players.value ? players.value.list : []));
const cardOf = pid => cards.value.find(c => c.pid === pid);
function neighbour(dir) {
  const n = cards.value.length;
  return cards.value[(((players.value.index + dir) % n) + n) % n].pid;
}
const easeOut = x => 1 - Math.pow(1 - x, 3);
const easeInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// The two pages, one over the other, GAP apart: the top one full size at t 0, the bottom one at
// t 1. In between, both shrink to 0.8 (halfway) and grow back, centred side to side, rounding as they do.
const pages = computed(() => {
  const pg = page.value;
  if (!pg) return [];
  const t = pg.dir > 0 ? pg.p : 1 - pg.p;
  const s = 1 - 0.2 * Math.sin(Math.PI * t);
  const h = 480 * s, tx = (800 - 800 * s) / 2, gap = 480 + GAP / 2 - t * (480 + GAP);
  const at = y => ({ transform: 'translate(' + tx + 'px, ' + y + 'px) scale(' + s + ')', borderRadius: (24 * (1 - s) / 0.2) / s + 'px' });
  const top = pg.dir > 0 ? pg.from : pg.to, bottom = pg.dir > 0 ? pg.to : pg.from;
  const out = [];
  if (top != null && cardOf(top)) out.push({ pid: top, card: cardOf(top), style: at(gap - GAP / 2 - h) });
  if (bottom != null && cardOf(bottom)) out.push({ pid: bottom, card: cardOf(bottom), style: at(gap + GAP / 2) });
  return out;
});
function stopPaging() {
  cancelAnimationFrame(pageFrame);
  clearTimeout(landTimer);
  pageSettling = false;
  page.value = null;
  landing.value = null;
}
function finishPage(done) {
  cancelAnimationFrame(pageFrame);
  pageSettling = false;
  const pg = page.value;
  if (!done || !pg || pg.to == null) return void (page.value = null);
  // Landed: hold the copy, full size, while the Mac switches to it.
  landing.value = pg.to;
  page.value = { ...pg, p: 1 };
  CT.send({ type: 'player', pid: pg.to });
  clearTimeout(landTimer);
  landTimer = setTimeout(stopPaging, LAND_GIVE_UP_MS);
}
watch(() => np.value.pid, pid => {
  if (landing.value == null || pid !== landing.value) return;
  clearTimeout(landTimer);
  landTimer = setTimeout(stopPaging, LAND_SETTLE_MS);
});
// Carries the page on to the end (done) or back to the start, from wherever the finger left it.
function settlePage(done, ease) {
  const pg = page.value;
  if (!pg) return;
  const from = pg.p, to = done ? 1 : 0, ms = Math.max(150, PAGE_MS * Math.abs(to - from)), t0 = performance.now();
  pageSettling = true;
  cancelAnimationFrame(pageFrame);
  const step = now => {
    const x = Math.min(1, (now - t0) / ms);
    page.value = { ...pg, p: from + (to - from) * (ease || easeOut)(x) };
    if (x < 1) pageFrame = requestAnimationFrame(step);
    else finishPage(done);
  };
  pageFrame = requestAnimationFrame(step);
}
const busy = () => pageSettling || landing.value != null;
screen.drag = (dx, dy, axis) => {
  if (!players.value || axis !== 'y' || busy()) return false;
  const dir = dy < 0 ? 1 : -1, to = neighbour(dir), share = Math.abs(dy) / PAGE_SPAN;
  page.value = { from: np.value.pid, to, dir, p: Math.min(1, share) };
};
screen.dragEnd = (dx, vx, axis, dy, vy) => {
  const pg = page.value;
  if (!pg || busy()) return;
  const along = -vy * pg.dir; // px/ms the page's way
  settlePage(Math.abs(vy) > FLICK_PX_MS ? along > 0 : pg.p > 0.5);
};
// Now Playing's button pressed again: the next player, as a whole page.
screen.reselect = () => {
  if (!players.value || busy()) return;
  const to = neighbour(1);
  if (to === np.value.pid) return;
  page.value = { from: np.value.pid, to, dir: 1, p: 0 };
  settlePage(true, easeInOut);
};
screen.liveViews = true; // the players come and go, so a dev reload doesn't page through them again
watch(() => state.current, current => { if (current !== 'nowplaying' && page.value && !landing.value) stopPaging(); });
watch(players, p => { if (!p && page.value) stopPaging(); });
let timer;
onMounted(() => {
  fitTitle();
  removeGestures = CT.gestures(root.value, {
    tap: e => {
      if (!e.target.closest('.screen-stage')) return;
      gesture(!np.value.active && coverUrl.value ? () => CT.send({ type: 'rerollCover' }) : 'playpause');
    },
    swipe: dir => gesture(dir === 'left' ? 'next' : 'previous'),
  });
  timer = setInterval(() => { if (state.current === 'nowplaying' && !state.asleep) updateProgress(); }, 250);
  if (document.fonts) document.fonts.ready.then(fitTitle);
});
onUnmounted(() => { clearInterval(timer); stopPaging(); if (removeGestures) removeGestures(); });
</script>
<template>
  <section ref="root" id="screen-nowplaying" class="screen fill flex" :class="{ active: state.current === 'nowplaying', leaving: state.leaving === 'nowplaying', idle: !np.active, 'idle-cover': !np.active && !!coverUrl, paused: np.active && !np.playing, 'no-duration': np.active && !np.duration, paging: !!page }">
    <LeftRail ref="rail" :variant="np.active ? 'media' : 'date'" :eyebrow="np.active ? np.artist : IDLE.eyebrow" :title="np.active ? np.title : IDLE.title" :subtitle="np.active ? album : IDLE.subtitle" :muted-subtitle="np.active && !np.album">
      <template #lower>
        <div v-if="np.active" class="np-progress flex items-center gap-8 primary"><UiProgress :value="fraction" /><span class="np-duration flex-none regular">{{ np.duration ? durationText(np.duration) : '' }}</span></div>
        <span v-else class="np-time">{{ time }}</span>
      </template>
    </LeftRail>
    <ScreenStage :class="{ 'bg-panel': hasArt || coverUrl }"><!-- behind art: one continuous background, so nothing is left as a square when the art fades -->
      <Artwork :url="stageArt" />
      <div v-if="!hasArt && !coverUrl" class="np-placeholder fill flex center"><svg><use href="#i-note" /></svg></div><!-- the cover's stand-in, idle or for a track without art -->
      <PauseDisc :paused="np.active && !np.playing" :icon="state.flashing ? state.flash.icon : 'pause'" :color="state.flashing ? state.flash.color : ''" /><!-- a flash here swaps its icon into this badge for a moment, in place of a second disc -->
      <img v-if="icon" class="badge" :src="icon" alt="" />
    </ScreenStage>
    <div v-if="page" class="np-pages fill"><!-- paging between players: still copies of each one's screen -->
      <div v-for="pg in pages" :key="pg.pid" class="np-page" :style="pg.style"><PlayerPage :card="pg.card" :fraction="pg.pid === np.pid ? fraction : null" /></div>
    </div>
  </section>
</template>
