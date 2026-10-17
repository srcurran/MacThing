<script setup>
// The Phosphor glyph after a back-action label (refresh, x, or the outline play and pause that match the refresh's weight), sized and set on the
// line to sit with the text beside it.
defineProps({ name: String, spinning: Boolean });
</script>
<template><svg class="back-action-icon" :class="{ 'is-spinning': spinning }" aria-hidden="true"><use :href="'#i-' + name" /></svg></template>
