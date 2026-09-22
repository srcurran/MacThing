<script setup>
import { computed } from 'vue';
import { describe } from '../weather.js';
const props = defineProps({ code: Number, isDay: { type: Boolean, default: true } });
const href = computed(() => props.code == null ? '' : describe(props.code, props.isDay).icon);
</script>
<template><svg><use :href="href" /></svg></template>
