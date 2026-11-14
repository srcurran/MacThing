<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { durationText, artFor } from '../state.js';
import { fitRailTitle } from '../fit-title.js';
import LeftRail from './LeftRail.vue';
import ScreenStage from './ScreenStage.vue';
import UiProgress from './UiProgress.vue';
import PauseDisc from './PauseDisc.vue';
// One player's Now Playing, drawn as the screen draws it (its rail, then its art across the stage),
// for paging between players (NowPlayingScreen.vue): a still copy, from the card the Mac sent for
// it. `fraction` overrides the progress the card was sent with (the shown player's, still moving).
const props = defineProps({ card: Object, fraction: { type: Number, default: null } });
const rail = ref(null);
const c = computed(() => props.card);
const album = computed(() => c.value.album || (c.value.kind !== 'music' && c.value.source ? c.value.source.name : '') || '');
const art = computed(() => { const a = artFor(c.value.artworkKey); return a ? a.dataUrl : ''; });
const progress = computed(() => props.fraction != null ? props.fraction : c.value.duration && c.value.elapsed != null ? c.value.elapsed / c.value.duration : 0);
const icon = computed(() => c.value.source ? c.value.source.icon : '');
const fit = () => nextTick(() => fitRailTitle(rail.value, true));
watch(() => [c.value.title, c.value.artist, album.value], fit);
onMounted(fit);
</script>
<template>
  <div class="np-page-screen flex" :class="{ 'no-duration': !c.duration }">
    <LeftRail ref="rail" variant="media" :eyebrow="c.artist" :title="c.title" :subtitle="album" :muted-subtitle="!c.album">
      <template #lower>
        <div class="np-progress flex items-center gap-8 primary"><UiProgress :value="progress" /><span class="np-duration flex-none regular">{{ c.duration ? durationText(c.duration) : '' }}</span></div>
      </template>
    </LeftRail>
    <ScreenStage class="bg-panel">
      <div v-if="art" class="art-img fill" :style="{ backgroundImage: 'url(' + JSON.stringify(art) + ')' }" />
      <div v-else class="np-placeholder fill flex center"><svg><use href="#i-note" /></svg></div>
      <PauseDisc :paused="!c.playing" icon="pause" />
      <img v-if="icon" class="badge" :src="icon" alt="" />
    </ScreenStage>
  </div>
</template>
