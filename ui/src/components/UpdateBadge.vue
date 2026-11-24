<script setup>
import { computed, ref } from 'vue';
import { state, CT } from '../state.js';
// A newer MacThing release: a small "Upgrade available" chip in the top-right corner, on every
// screen, until it's dismissed. A tap on it opens Settings, whose top row ("Update available") is
// where the upgrade lives from then on; a tap anywhere else dismisses it (that tap still does what
// it does there), and so does opening Settings any other way. Dismissed is per version, kept
// across reloads, so the next release brings it back.
const DISMISSED_KEY = 'ct-update-dismissed';
const dismissed = ref(null);
try { dismissed.value = localStorage.getItem(DISMISSED_KEY); } catch (e) {}
const latest = computed(() => (state.update.available && state.update.latest) || null);
const show = computed(() => !!latest.value && latest.value !== dismissed.value && state.current !== 'settings');
function dismiss() {
  dismissed.value = latest.value;
  try { localStorage.setItem(DISMISSED_KEY, latest.value); } catch (e) {}
}
// Capture, so it runs before the screen under the tap. A tap that only wakes the dark screen
// hasn't seen the chip, so it stays.
window.addEventListener('pointerdown', (e) => {
  if (!show.value || CT.asleep) return;
  if (e.target.closest && e.target.closest('.update-badge')) {
    e.stopPropagation(); // the chip's tap is only the chip's: nothing under it gets it
    e.preventDefault();
    CT.tap(() => CT.runButton('settings')); // as the Settings button does; Settings then dismisses it
    return;
  }
  dismiss();
}, true);
// Settings shows the upgrade itself; having seen it there, the chip has done its job.
CT.onSecond(() => { if (latest.value && state.current === 'settings' && dismissed.value !== latest.value) dismiss(); });
</script>
<template>
  <div class="update-badge" :class="{ on: show }">Upgrade available</div>
</template>
