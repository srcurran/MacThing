<script setup>
import { ref } from 'vue';
import { state, CT } from '../state.js';
import LeftRail from '../components/LeftRail.vue';
import ScreenStage from '../components/ScreenStage.vue';
import SettingsRow from '../components/SettingsRow.vue';
const rows = [
  { key: 'theme', label: 'Appearance', options: [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Match Mac']] },
  { key: 'units', label: 'Temperature', options: [['F', '°F'], ['C', '°C']] },
  { key: 'clock24h', label: 'Time format', options: [[false, '12-hour'], [true, '24-hour']] },
  { key: 'artBackground', label: 'Album art background', options: [[false, 'Off'], [true, 'On']] },
  { label: 'Weather location', page: 'location', value: s => s.location && s.location.mode === 'manual' ? s.location.name : 'Current location' },
  { label: 'More settings on Mac', page: '', value: () => '' }
];
const selected = ref(0);
const index = row => Math.max(0, row.options.findIndex(option => option[0] === state.settings[row.key]));
const value = row => row.value ? row.value(state.settings) : row.options[index(row)][1];
const screen = CT.screen('settings');
screen.show = () => { selected.value = 0; };
screen.turn = steps => { selected.value = Math.max(0, Math.min(rows.length - 1, selected.value + steps)); };
screen.press = () => {
  const row = rows[selected.value];
  if (row.page != null) { CT.send({ type: 'openSettingsPage', section: row.page }); CT.toast('Opened on your Mac'); return; }
  const next = row.options[(index(row) + 1) % row.options.length][0];
  state.settings[row.key] = next;
  CT.send({ type: 'setting', key: row.key, value: next });
  CT.applyTheme();
};
</script>
<template>
  <section id="screen-settings" class="screen fill flex" :class="{ active: state.current === 'settings' }">
    <LeftRail title="Settings" variant="instructions" lower-content="Settings or back button to close">
      <template #subtitle>Turn the knob to choose.<br />Press it to change.</template>
    </LeftRail>
    <ScreenStage><div class="s-list">
      <SettingsRow v-for="(row, i) in rows" :key="row.label" :label="row.label" :value="value(row)" :selected="selected === i" :link="row.page != null" />
    </div></ScreenStage>
  </section>
</template>
