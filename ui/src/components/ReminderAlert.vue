<script setup>
import { computed, ref, watch } from 'vue';
import { state, CT } from '../state.js';
// Settings → Reminders (on the Mac): "Drink water" every so often or "Stretch" at 3:00, as a card
// like the meeting alert's. The Mac decides when one is due and sends it here. First pass:
// - Any press dismisses it ("Done"); left alone, it goes after SHOW_MS by itself.
// - A meeting's card comes first: a reminder waits under it and shows once it's dismissed.
// - Only one card at a time. The same reminder due again replaces itself rather than queuing.
const SHOW_MS = 60000;
const queue = ref([]); // reminders due and not yet dismissed, oldest first
CT.on('reminder', msg => {
  const r = msg.reminder;
  queue.value = queue.value.filter(x => x.id !== r.id).concat({ ...r, shownAt: 0 });
});
// The meeting alert (mounted first) owns the modal hooks; chain onto them so it goes first.
const meetingOpen = CT.modalOpen || (() => false);
const meetingDismiss = CT.dismissModal || (() => false);
const reminder = computed(() => (meetingOpen() ? null : queue.value[0] || null));
// The card shows the reminder up, and the last one while it slides away once it's gone.
let lastReminder = null;
const card = computed(() => (lastReminder = reminder.value || lastReminder));
function done(why) {
  logEvent('done: "' + queue.value[0].text + '" (' + why + ')');
  queue.value = queue.value.slice(1);
}
// With flags.json's logEvents: when a card covers the screen and how it goes (see core.js).
const logEvent = text => CT.logEvent && CT.logEvent('[reminder] ' + text);
watch(() => reminder.value && reminder.value.id, id => {
  if (id) logEvent('up: "' + reminder.value.text + '" (over ' + state.current + ')');
});
// The clock ticks once a second; a card left alone that long goes by itself.
CT.onSecond(now => {
  const r = queue.value[0];
  if (!r || meetingOpen()) return;
  if (!r.shownAt) r.shownAt = now;
  else if (now - r.shownAt >= SHOW_MS) done('left alone ' + SHOW_MS / 1000 + 's');
});
CT.modalOpen = () => meetingOpen() || !!reminder.value;
CT.dismissModal = key => {
  if (meetingDismiss(key)) return true;
  if (!reminder.value) return false;
  done(key);
  return true;
};
// The pill: "Every 45 min", or the time it was set for ("3:00 PM").
const every = computed(() => {
  if (card.value.repeat === 'times') return CT.timeText(card.value.at);
  const m = card.value.every;
  return 'Every ' + (m % 60 ? m + ' min' : m / 60 + (m === 60 ? ' hour' : ' hours'));
});
</script>
<template>
  <div class="meeting-alert reminder-alert fill flex" :class="{ on: !!reminder }" @click="CT.tap(() => CT.dismissModal('tap'))">
    <div v-if="card" class="m-card flex-col">
      <div class="m-title clamp-2">{{ card.text }}</div>
      <div class="m-foot flex">
        <div class="m-when r-every">{{ every }}</div>
        <div class="m-start">Done</div>
      </div>
    </div>
  </div>
</template>
