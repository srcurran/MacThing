<script setup>
// The paused badge over the stage: a black disc with the pause icon, fading in while paused.
defineProps({ paused: Boolean, icon: { type: String, default: 'pause' }, color: { type: String, default: '' } });
</script>
<template>
  <div class="paused-glyph pause-disc disc fill flex center" :class="{ on: paused }" :style="{ color }">
    <svg><use :href="'#i-' + icon" /></svg>
  </div>
</template>
