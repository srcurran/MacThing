<script setup>
import { ref, watch, onUnmounted } from 'vue';
const props = defineProps({ url: String });
const layers = ref(['', '']);
const front = ref(0);
let timer;
watch(() => props.url, url => {
  const previous = front.value;
  const next = 1 - previous;
  layers.value[next] = url || '';
  front.value = next;
  clearTimeout(timer);
  timer = setTimeout(() => { layers.value[previous] = ''; }, 600);
}, { immediate: true });
onUnmounted(() => clearTimeout(timer));
</script>
<template>
  <div v-for="(url, i) in layers" :key="i" class="art-layer fill" :class="{ front: i === front }">
    <div class="art-img fill" :style="{ backgroundImage: url ? 'url(' + JSON.stringify(url) + ')' : 'none' }" />
  </div>
</template>
