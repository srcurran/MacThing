<script setup>
import { ref, watch, onUnmounted } from 'vue';
// direction: 'next' | 'previous' when the change came from a skip on the device, else ''.
const props = defineProps({ url: String, direction: { type: String, default: '' } });
const layers = ref(['', '']);
const front = ref(0);
// New art fades in over the old, which stays fully opaque underneath until it is covered. Fading
// both at once dips to half-transparent midway, so even two identical covers visibly blink.
// Going to no art fades the old one out instead, as there is nothing to cover it with.
const under = ref(-1);
// After a skip the new art wipes across instead (see .wipe-next in app.css). Each new cover gets a
// fresh .art-wipe element (keyed by gen), so the wipe restarts even if that layer wiped the same
// way last time. The old layer keeps its wipe class: at rest it looks the same as none, and
// changing it would redraw that layer just as the new wipe starts.
const wipes = ref(['', '']);
const gen = ref([0, 0]);
let timer;
watch(() => props.url, url => {
  const previous = front.value;
  const next = 1 - previous;
  layers.value[next] = url || '';
  wipes.value[next] = url && layers.value[previous] && props.direction ? props.direction : '';
  gen.value[next]++;
  front.value = next;
  under.value = url && layers.value[previous] ? previous : -1;
  clearTimeout(timer);
  timer = setTimeout(() => { layers.value[previous] = ''; under.value = -1; }, 600);
}, { immediate: true });
onUnmounted(() => clearTimeout(timer));
</script>
<template>
  <div class="art fill">
    <div v-for="(url, i) in layers" :key="i" class="art-layer fill" :class="{ front: i === front, under: i === under, wiping: i === front && !!wipes[i] }">
      <div :key="gen[i]" class="art-wipe fill" :class="wipes[i] && 'wipe-' + wipes[i]">
        <div class="art-slide fill">
          <div class="art-img fill" :style="{ backgroundImage: url ? 'url(' + JSON.stringify(url) + ')' : 'none' }" />
        </div>
      </div>
    </div>
  </div>
</template>
