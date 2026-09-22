<script setup>
import { computed } from 'vue';
import { CT } from '../state.js';
const props = defineProps({ event: Object, now: Number });
const ongoing = computed(() => !props.event.allDay && props.event.start <= props.now);
const where = computed(() => (props.event.location || '').split('\n')[0]);
</script>
<template>
  <div class="k-event flex font-small" :class="{ now: ongoing }">
    <div class="k-bar flex-none" :style="{ background: event.color }" />
    <div class="k-body flex-1">
      <div class="flex"><span class="k-time flex-none secondary medium">{{ event.allDay ? 'All day' : ongoing ? 'NOW' : CT.timeText(event.start) }}</span><span class="flex-1 semibold truncate">{{ event.title || 'Untitled' }}</span></div>
      <div v-if="where" class="mt-4 weight-light muted truncate">{{ where }}</div>
    </div>
  </div>
</template>
