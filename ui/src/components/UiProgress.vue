<script setup>
import { computed } from 'vue';
const props = defineProps({ value: { type: Number, default: 0 }, tone: { type: String, default: 'accent' } });
const fraction = computed(() => Math.max(0, Math.min(1, Number.isFinite(props.value) ? props.value : 0)));
</script>
<template>
  <div class="ui-progress flex-1" :tone="tone" role="progressbar" :aria-valuenow="Math.round(fraction * 100)" aria-valuemin="0" aria-valuemax="100">
    <span class="progress-fill fill" :style="{ transform: 'scaleX(' + fraction + ')' }" />
  </div>
</template>
