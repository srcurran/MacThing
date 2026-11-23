<script setup>
import { computed, ref } from 'vue';
import { state, CT } from '../state.js';
import LeftRail from '../components/LeftRail.vue';
import ScreenStage from '../components/ScreenStage.vue';
import SettingsRow from '../components/SettingsRow.vue';
const baseRows = [
  { key: 'theme', label: 'Appearance', options: [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Match Mac']] },
  { key: 'artBackground', label: 'Album art background', options: [[false, 'Off'], [true, 'On']] },
  { key: 'meetingAlert', label: 'Meeting alerts', options: [[0, 'Off'], ['event', 'Event’s alert'], [1, '1 min before'], [5, '5 min before'], [10, '10 min before']] },
  { key: 'screenSleep', label: 'Sleep', options: [['mac', 'With Mac'], [30, 'Mac idle 30 min'], [60, 'Mac idle 1 hr'], [120, 'Mac idle 2 hr'], [240, 'Mac idle 4 hr'], ['never', 'Never']] },
  // Pinned to the bottom: the space left over above it sets it apart (none once the list is full).
  { label: 'More settings on Mac', page: '', value: () => '', bottom: true }
];
// A newer release goes at the top, where it's seen first; pressing it opens the Mac page's Updates
// section, which has the Update now button. Its dot sits left of the row, outside its highlight, so
// the label still lines up with the rest.
const rows = computed(() => state.update.available
  ? [{ label: 'Update available', page: 'updates', value: () => state.update.latest, dot: true }, ...baseRows]
  : baseRows);
const selected = ref(0);
// Six rows fit the stage; past that the list scrolls to keep the selection in view.
const VISIBLE = 6;
const scrolled = computed(() => Math.max(0, selected.value - (VISIBLE - 1)));
// With room to spare, the bottom row stands apart under a gap rather than a divider.
const apart = computed(() => rows.value.length < VISIBLE);
const index = row => Math.max(0, row.options.findIndex(option => option[0] === state.settings[row.key]));
const value = row => row.value ? row.value(state.settings) : row.options[index(row)][1];
const screen = CT.screen('settings');
screen.show = () => { selected.value = 0; };
screen.turn = steps => {
  selected.value = Math.max(0, Math.min(rows.value.length - 1, selected.value + steps));
};
function openOnMac(section) {
  CT.send({ type: 'openSettingsPage', section });
  CT.toast('Opened on your Mac');
}
// The back button opens the settings page on the Mac, at the selected row's section if it has one.
screen.back = () => openOnMac(rows.value[selected.value].page || '');
screen.press = () => {
  const row = rows.value[selected.value];
  if (row.page != null) return openOnMac(row.page);
  const next = row.options[(index(row) + 1) % row.options.length][0];
  state.settings[row.key] = next;
  CT.send({ type: 'setting', key: row.key, value: next });
  CT.applyTheme();
};
</script>
<template>
  <section id="screen-settings" class="screen fill flex" :class="{ active: state.current === 'settings', leaving: state.leaving === 'settings' }">
    <LeftRail title="Settings" variant="instructions">
      <template #subtitle>Turn the knob to choose.<br />Press it to change.</template>
    </LeftRail>
    <ScreenStage class="bg-panel"><div class="s-list"><div class="s-rows" :style="{ transform: 'translateY(' + -scrolled * 64 + 'px)' }">
      <SettingsRow v-for="(row, i) in rows" :key="row.label" :class="{ 's-bottom': row.bottom, 's-apart': row.bottom && apart, 's-dot': row.dot }" :label="row.label" :value="value(row)" :selected="selected === i" :link="row.page != null" />
    </div></div></ScreenStage>
  </section>
</template>
