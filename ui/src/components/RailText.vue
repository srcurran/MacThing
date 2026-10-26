<script setup>
import { computed } from 'vue';
import { state } from '../state.js';
const props = defineProps({
  text: { type: [String, Number], default: '' },
  italicSuffix: { type: String, default: '' }
});
// A trailing run of 🔥, 💀 or 🕶️ (how hot a usage pace is, see usage.js) is drawn as images after
// the text: the Mac's Apple emoji once it has sent them, else the bundled Twemoji. Without the
// Mac's skull, the limit shows the three bundled fires it used to.
const BUNDLED = { '🔥': ['images/emoji/1f525.svg'], '💀': Array(3).fill('images/emoji/1f525.svg'), '🕶️': ['images/emoji/1f576.svg'] };
const parts = computed(() => {
  // 🕶️ is two code points (the glasses and an emoji variation selector), so match whole emoji.
  const [, body, run] = String(props.text).match(/^(.*?)\s*((?:🔥|💀|🕶\uFE0F?)*)$/su);
  const icons = (run.match(/🔥|💀|🕶\uFE0F?/gu) || []).map(e => e.startsWith('🕶') ? '🕶️' : e);
  const images = icons.flatMap(e => state.emoji[e] ? [{ src: state.emoji[e], mac: true }] : BUNDLED[e].map(src => ({ src })));
  const alone = !body && icons.length === 1 && images.length === 1;
  return { body, icons: icons.join(''), images, skull: alone && icons[0] === '💀', shades: alone && icons[0] === '🕶️' };
});
const hasItalicSuffix = computed(() => props.italicSuffix && parts.value.body.endsWith(props.italicSuffix));
</script>

<template>
  <template v-if="hasItalicSuffix">{{ parts.body.slice(0, -italicSuffix.length) }}<i>{{ italicSuffix }}</i></template>
  <template v-else>{{ parts.body }}</template>
  <span v-if="parts.images.length" class="rail-fires" :class="{ 'rail-fires-after': parts.body, 'rail-skull': parts.skull, 'rail-shades': parts.shades }" role="img" :aria-label="parts.icons"><img v-for="(img, n) in parts.images" :key="n" class="rail-emoji" :class="{ 'rail-emoji-mac': img.mac }" :src="img.src" alt="" /></span>
</template>
