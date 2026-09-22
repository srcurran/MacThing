<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { state, CT, elapsed, durationText, artworkUrl } from '../state.js';
import LeftRail from '../components/LeftRail.vue';
import ScreenStage from '../components/ScreenStage.vue';
import UiProgress from '../components/UiProgress.vue';
import AnalogClock from '../components/AnalogClock.vue';
import Artwork from '../components/Artwork.vue';
const root = ref(null), rail = ref(null);
const np = computed(() => state.np);
const album = computed(() => !np.value.active ? '' : np.value.album || (np.value.kind !== 'music' && np.value.source ? np.value.source.name : '') || '');
const icon = computed(() => np.value.active && np.value.source ? np.value.source.icon : '');
const fraction = ref(0);
function updateProgress() { fraction.value = np.value.duration ? elapsed() / np.value.duration : 0; }
// Measured typography is the only imperative layout here. These inline values
// deliberately override .np-title's fallback font-size/line-height.
function fitTitle() {
  const t = rail.value && rail.value.titleElement;
  if (!t || !root.value) return;
  const content = root.value.querySelector('.left-rail-content');
  t.style.webkitLineClamp = '';
  if (!np.value.active) { t.style.fontSize = '32px'; t.style.lineHeight = '40px'; return; }
  const scale = [[48, 64], [40, 56], [28, 36]];
  for (const [size, line] of scale) {
    t.style.fontSize = size + 'px'; t.style.lineHeight = line + 'px';
    const last = rail.value.subtitleElement || t;
    if (last.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom && t.offsetHeight <= line * 5.01) return;
  }
  const last = rail.value.subtitleElement || t;
  const overflow = Math.max(0, last.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom);
  t.style.webkitLineClamp = String(Math.max(1, Math.min(5, Math.floor((t.offsetHeight - overflow) / 36))));
}
watch(() => [np.value.active, np.value.artist, np.value.title, album.value, state.current], () => nextTick(fitTitle));
watch(() => [state.np, state.npAt], updateProgress);
const screen = CT.screen('nowplaying');
screen.show = () => { updateProgress(); nextTick(fitTitle); };
let timer;
onMounted(() => {
  fitTitle();
  timer = setInterval(() => { if (state.current === 'nowplaying' && !state.asleep) updateProgress(); }, 250);
  if (document.fonts) document.fonts.ready.then(fitTitle);
});
onUnmounted(() => clearInterval(timer));
</script>
<template>
  <section ref="root" id="screen-nowplaying" class="screen fill flex" :class="{ active: state.current === 'nowplaying', idle: !np.active, paused: np.active && !np.playing, 'no-duration': !np.duration }">
    <LeftRail ref="rail" variant="media" :eyebrow="np.active ? np.artist : ''" :title="np.active ? np.title : 'Nothing playing'" :subtitle="album" :muted-subtitle="!np.album">
      <template #lower>
        <div class="np-progress flex items-center gap-8 primary"><UiProgress :value="fraction" tone="neutral" /><span class="np-duration flex-none regular">{{ np.duration ? durationText(np.duration) : '' }}</span></div>
      </template>
    </LeftRail>
    <ScreenStage :class="{ 'bg-panel': !np.active }"><!-- idle: one continuous background, like the Clock screen -->
      <Artwork :url="artworkUrl" />
      <AnalogClock v-if="!np.active" :now="state.current === 'nowplaying' ? state.now : 0" />
      <div class="paused-glyph disc fill flex center"><svg><use href="#i-pause" /></svg></div>
      <img v-if="icon" class="badge" :src="icon" alt="" />
    </ScreenStage>
  </section>
</template>
