<script setup>
import { ref } from 'vue';
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: [String, Number], default: '' },
  subtitle: { type: String, default: '' },
  lowerContent: { type: String, default: '' },
  variant: { type: String, default: 'display' },
  view: { type: String, default: '' }, // a change fades the text out and the new text in
  mutedSubtitle: Boolean
});
const titleElement = ref(null), subtitleElement = ref(null);
defineExpose({ titleElement, subtitleElement });
</script>

<template>
  <div class="left-rail flex-col justify-between" :data-variant="variant">
    <Transition name="view"><div :key="view" class="left-rail-content flex-col gap-12" :data-view="view">
      <p v-if="eyebrow || $slots.eyebrow" class="font-small bold" :class="variant === 'media' ? 'clamp-2' : 'truncate'"><slot name="eyebrow">{{ eyebrow }}</slot></p>
      <h2 ref="titleElement" :class="[variant === 'media' ? 'np-title' : variant === 'instructions' ? 'font-medium semibold' : 'font-huge', { 'calendar-time overflow-hidden': variant === 'time' }]"><slot name="title">{{ title }}</slot></h2>
      <div v-if="subtitle || $slots.subtitle" ref="subtitleElement" :class="[variant === 'media' || variant === 'instructions' ? 'font-small weight-light' : 'font-medium semibold', { 'clamp-2': variant === 'media', muted: mutedSubtitle || variant === 'instructions' }]"><slot name="subtitle">{{ subtitle }}</slot></div>
    </div></Transition>
    <div v-if="lowerContent || $slots.lower" class="flex-none font-small muted" :class="variant === 'instructions' ? 'weight-light' : 'medium truncate'"><slot name="lower">{{ lowerContent }}</slot></div>
  </div>
</template>
