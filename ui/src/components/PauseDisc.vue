<script setup>
import { ref, watch, onUnmounted } from 'vue';
// The paused badge over the stage: a disc with the pause icon, fading in while paused. Chromium 69
// has no backdrop-filter, so its frosted look is faked: the slot is a blurred copy of what's on the
// stage under it (the art, the dial), drawn the stage's size and lined up with it, and clipped by
// the disc. The copy is only drawn while the disc shows (and through its fade out), so a running
// timer doesn't redraw a blur every second behind an invisible disc.
const props = defineProps({ paused: Boolean, icon: { type: String, default: 'pause' }, color: { type: String, default: '' } });
const FADE_MS = 300; // .paused-glyph's opacity transition
const blur = ref(props.paused);
let timer;
watch(() => props.paused, paused => {
  clearTimeout(timer);
  if (paused) blur.value = true;
  else timer = setTimeout(() => { blur.value = false; }, FADE_MS);
});
onUnmounted(() => clearTimeout(timer));
</script>
<template>
  <div class="paused-glyph pause-disc disc fill flex center" :style="{ color }">
    <div v-if="blur" class="pause-disc-blur"><slot /></div>
    <div class="pause-disc-tint fill" />
    <svg class="pause-disc-icon"><use :href="'#i-' + icon" /></svg>
  </div>
</template>
