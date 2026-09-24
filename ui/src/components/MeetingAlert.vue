<script setup>
import { computed, reactive } from 'vue';
import { state, CT } from '../state.js';
// Settings → Meeting alerts: a card over every screen from a few minutes before a timed event
// until a few minutes after it starts. Any button or knob press dismisses it (and does nothing
// else); turning the knob still sets the volume.
const AFTER_START_MS = 5 * 60000;
const STORE = 'ct-dismissed-meetings';
const keyOf = e => (e.calendarId || '') + '|' + e.start + '|' + (e.title || '');
// Kept across page reloads (dev, a bridge restart) so a dismissed alert doesn't come back.
const dismissed = reactive(load());
function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
}
function save() {
  Object.keys(dismissed).forEach(key => { if (dismissed[key] < state.now) delete dismissed[key]; });
  try { localStorage.setItem(STORE, JSON.stringify(dismissed)); } catch (e) {}
}
const event = computed(() => {
  const lead = state.settings.meetingAlert;
  if (!lead || state.calendar.status !== 'ok') return null;
  return state.calendar.events.find(e => !e.allDay && !dismissed[keyOf(e)] &&
    e.start - lead * 60000 <= state.now && state.now < Math.min(e.end, e.start + AFTER_START_MS)) || null;
});
CT.dismissModal = () => {
  if (!event.value) return false;
  dismissed[keyOf(event.value)] = event.value.start + AFTER_START_MS;
  save();
  return true;
};
const when = computed(() => {
  const minutes = Math.round((event.value.start - state.now) / 60000);
  if (minutes > 0) return 'In ' + minutes + ' min';
  if (minutes < 0) return 'Started ' + -minutes + ' min ago';
  return 'Starting now';
});
// "2:00 – 2:30 PM", keeping both AM/PMs only when the meeting spans noon or midnight.
const range = computed(() => {
  const start = CT.clockText(CT.parts(event.value.start)), end = CT.clockText(CT.parts(event.value.end));
  return (start.ampm === end.ampm ? start.time : start.time + ' ' + start.ampm) + ' – ' + end.time + (end.ampm ? ' ' + end.ampm : '');
});
const where = computed(() => (event.value.location || '').split('\n')[0]);
</script>
<template>
  <div class="meeting-alert fill flex center" :class="{ on: !!event }">
    <div v-if="event" class="m-card flex">
      <div class="m-bar flex-none" :style="{ background: event.color }" />
      <div class="flex-1 flex-col">
        <div class="font-small bold accent">{{ when }}</div>
        <div class="m-title mt-12 font-medium semibold clamp-2">{{ event.title || 'Untitled' }}</div>
        <div class="mt-12 font-small medium secondary tabular">{{ range }}</div>
        <div v-if="where" class="mt-4 font-small weight-light muted truncate">{{ where }}</div>
        <div class="m-hint mt-28 font-small weight-light muted">Press any button to dismiss</div>
      </div>
    </div>
  </div>
</template>
