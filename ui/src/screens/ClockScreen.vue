<script setup>
import { computed, ref, watch } from 'vue';
import { state, CT } from '../state.js';
import LeftRail from '../components/LeftRail.vue';
import ScreenStage from '../components/ScreenStage.vue';
import AnalogClock from '../components/AnalogClock.vue';
import TimeTimer from '../components/TimeTimer.vue';
import TimerDeck, { firstCardAt, positionAt } from '../components/TimerDeck.vue';
import ClaudeUsage from '../components/ClaudeUsage.vue';
import BackActionIcon from '../components/BackActionIcon.vue';
import { SESSION_MS, WEEK_MS, paceNumber, untilText, usageProviders, usageOf, usageName, usageUpdatedText } from '../usage.js';
import { cards, startTimer, toggleTimer, removeTimer, removeDoneTimers } from '../timer.js';
const parts = computed(() => CT.parts(state.now));
const face = computed(() => state.settings.clockFace);
const time = computed(() => CT.clockText(parts.value));
// The digital face stacks the hours over the minutes, both two digits (5:01 → 05 over :  01).
const digits = computed(() => { const [hours, minutes] = time.value.time.split(':'); return { hours: hours.padStart(2, '0'), minutes }; });
const next = computed(() => state.calendar.status === 'ok' ? state.calendar.events.find(e => !e.allDay && e.start > state.now && CT.dayNumber(e.start) === CT.dayNumber(state.now)) : null);
// The clock button, pressed on the clock, steps it to the timer, then each usage Settings → Usage
// asks for (Claude, ChatGPT, both or none), then back (the timer's own controls are further down).
// Opening a usage asks the Mac for fresh numbers (Claude's at most once a minute).
const providers = computed(() => usageProviders(state));
const modes = computed(() => ['clock', 'timer', ...providers.value]);
const isUsage = m => m === 'claude' || m === 'chatgpt';
const mode = ref('clock');
const screen = CT.screen('clock');
screen.reselect = () => {
  mode.value = modes.value[(modes.value.indexOf(mode.value) + 1) % modes.value.length];
  if (mode.value === 'timer') openTimer();
  if (isUsage(mode.value)) CT.send({ type: 'refreshUsage' });
};
screen.show = () => { if (isUsage(mode.value)) CT.send({ type: 'refreshUsage' }); };
// Once a usage's "10m ⟳" is up, the back button asks the Mac to try again:
// the ⟳ turns once, then ••• until the Mac says it's done. Still stale after that, it shows ✕
// until another try is allowed. One try at a time, a minute apart at least (Claude's own ask
// limit), so pressing it again and again doesn't reach the service; a press too soon says how long.
const REFRESH_SPIN_MS = 600, REFRESH_COOLDOWN_MS = 60000, REFRESH_GIVE_UP_MS = 30000, WAIT_SHOWN_MS = 2000;
let refreshAt = -Infinity, refreshDone = true, refreshProvider = '', giveUpTimer = null, waitTimer = null;
const isStale = provider => !!usageUpdatedText(usageOf(state, provider), state.now);
function settleRefresh() {
  state.usageRefresh = isStale(refreshProvider) ? 'failed' : '';
  const left = refreshAt + REFRESH_COOLDOWN_MS - performance.now();
  if (state.usageRefresh) setTimeout(() => { if (state.usageRefresh === 'failed') state.usageRefresh = ''; }, left);
}
function finishRefresh() {
  if (refreshDone) return;
  refreshDone = true;
  clearTimeout(giveUpTimer);
  if (state.usageRefresh === 'pending') settleRefresh();
}
CT.on('usageRefreshed', finishRefresh);
screen.back = () => {
  if (mode.value === 'timer') return timerBackPress();
  if (!isUsage(mode.value) || !isStale(mode.value)) return false;
  if (state.usageRefresh === 'spin' || state.usageRefresh === 'pending') return;
  const wait = refreshAt + REFRESH_COOLDOWN_MS - performance.now();
  if (wait > 0) {
    state.usageRefreshWait = 'wait ' + Math.ceil(wait / 1000) + 's';
    clearTimeout(waitTimer);
    waitTimer = setTimeout(() => { state.usageRefreshWait = ''; }, WAIT_SHOWN_MS);
    return;
  }
  refreshAt = performance.now();
  refreshDone = false;
  refreshProvider = mode.value;
  state.usageRefresh = 'spin';
  CT.send({ type: 'refreshUsage', ack: true });
  setTimeout(() => { if (refreshDone) settleRefresh(); else state.usageRefresh = 'pending'; }, REFRESH_SPIN_MS);
  giveUpTimer = setTimeout(finishRefresh, REFRESH_GIVE_UP_MS);
};
// ---- The timer ----------------------------------------------------------------------------
// Two views: the deck (TimerDeck.vue: the presets and every timer's card, one stripe) and one card
// full size (the rail and the dial, like the other views). With no timer of yours going it opens
// on the deck, resting on the presets; with one, on that timer. The deck's stripe follows a
// dragging finger and, let go, rests on the presets or with a card centred: the nearest, or, let
// go moving, the next one that way. A swipe on the full-size timer goes back to the deck, a card
// along. Resting on a card that's counting for 5 seconds zooms it up to full size. Tapping a
// preset starts another timer and moves to its card; tapping a card moves to it, or, already on
// it, zooms it (the last length used, tapped, starts it again); tapping the full-size one goes
// back to the deck. The knob press starts or pauses the timer you're on (twice:
// puts it away); the back button puts away a paused or finished one, and the corner says so.
// Turning the knob sets the volume.
const SETTLE_MS = 5000, ZOOM_MS = 300;
const focusId = ref('last');
const timerView = ref('deck'); // 'deck' | 'timer'
const zooming = ref(false);
const atPresets = ref(true); // resting on the presets (the first card beside them, in focus)
const dragPosition = ref(null); // the stripe's position while a finger drags it
let lastFocus = 0, settleTimer = null, zoomTimer = null, dragFrom = 0;
const FLICK_PX_MS = 0.3;
const focusIndex = computed(() => {
  const i = cards.value.findIndex(c => c.id === focusId.value);
  return i >= 0 ? i : Math.min(lastFocus, cards.value.length - 1);
});
const focused = computed(() => cards.value[focusIndex.value]);
// Where the deck rests: 0 on the presets, then 1, 2… with that card centred (TimerDeck.vue).
const restPosition = computed(() => (atPresets.value ? 0 : focusIndex.value + 1));
const deckPosition = computed(() => (dragPosition.value == null ? restPosition.value : dragPosition.value));
// A card that's gone (a meeting over, a timer put away) leaves the focus on the one that took its
// place, and the full-size view goes back to the deck.
watch(focusIndex, i => { lastFocus = i; });
watch(() => focused.value.id, id => {
  if (id === focusId.value) return;
  focusId.value = id;
  if (timerView.value === 'timer') timerView.value = 'deck';
});
function focusOn(id) {
  focusId.value = id;
  atPresets.value = false;
  timerView.value = 'deck';
  settle();
}
function restOn(position) {
  position = Math.max(0, Math.min(cards.value.length, position));
  if (position) return focusOn(cards.value[position - 1].id);
  clearTimeout(settleTimer);
  focusId.value = cards.value[0].id;
  atPresets.value = true;
  timerView.value = 'deck';
}
// Staying on a card that's counting zooms it up to full size: the card grows as the deck fades.
function settle() {
  clearTimeout(settleTimer);
  if (!atPresets.value && focused.value.kind !== 'last') settleTimer = setTimeout(zoom, SETTLE_MS);
}
function zoom() {
  clearTimeout(settleTimer);
  if (mode.value !== 'timer' || timerView.value !== 'deck') return;
  zooming.value = true;
  timerView.value = 'timer';
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => { zooming.value = false; }, ZOOM_MS);
}
/** Opening the timer: on the card asked for (full size), else on a timer of yours if one's going
 *  (full size), else the deck from its start. */
function openTimer(id) {
  clearTimeout(settleTimer);
  const mine = cards.value.filter(c => c.kind === 'timer');
  if (id && cards.value.some(c => c.id === id)) focusId.value = id;
  else if (mine.length) { if (focused.value.kind !== 'timer') focusId.value = mine[0].id; }
  else return restOn(0);
  atPresets.value = false;
  timerView.value = 'timer';
}
function startFromPreset(minutes) {
  focusOn(startTimer(minutes));
}
function pickCard(id) {
  if (id !== focusId.value || atPresets.value) return focusOn(id);
  if (focused.value.kind === 'last') return startFromPreset(focused.value.total / 60000);
  zoom();
}
function backToDeck() {
  if (mode.value === 'timer' && timerView.value === 'timer') focusOn(focusId.value);
}
const timerResets = computed(() => focused.value.kind === 'timer' && (focused.value.status === 'paused' || focused.value.status === 'done'));
function timerBackPress() {
  if (!timerResets.value) return false;
  removeTimer(focused.value.id);
}
// A usage that's been taken out of Settings → Usage while it's up gives way to the clock.
watch(providers, list => { if (isUsage(mode.value) && !list.includes(mode.value)) mode.value = 'clock'; });
// Each usage's rail says how worried to be about the session, and the week under it (see usage.js).
function usageRail(provider) {
  const u = usageOf(state, provider);
  if (u.status !== 'ok') return { eyebrow: usageName(provider) + ' usage', title: '--', subtitle: '' };
  return {
    italicSuffix: 'x',
    subtitleClass: 'usage-week',
    eyebrow: 'Session: ' + Math.round(u.session.percent) + '% used',
    title: paceNumber(u.session, SESSION_MS, state.now, { updatedAt: u.updatedAt }),
    subtitle: 'Week: ' + paceNumber(u.week, WEEK_MS, state.now, { maxFires: 0 }),
    subtitleNote: '· ' + Math.round(u.week.percent) + '%'
  };
}
const railViews = computed(() => {
  const views = { clock: { eyebrow: CT.MONTHS[parts.value.month], title: parts.value.date, subtitle: CT.DAYS[parts.value.day] }, timer: { eyebrow: focused.value.label, title: focused.value.title, subtitle: time.value.time } };
  providers.value.forEach(p => { views[p] = usageRail(p); });
  return views;
});
// On a usage, the line at the bottom is when its windows reset instead of the next event.
const resets = computed(() => {
  if (!isUsage(mode.value)) return null;
  const u = usageOf(state, mode.value);
  return u.status === 'ok' ? { session: untilText(u.session.resetsAt, state.now, SESSION_MS), week: untilText(u.week.resetsAt, state.now, WEEK_MS) } : null;
});
// The meeting alert's start button: brings that meeting's timer up, full size, on the clock screen.
CT.showTimer = id => {
  mode.value = 'timer';
  openTimer(id);
  CT.show('clock');
};
// Smart switching: brings a provider's usage up on the clock screen.
CT.showUsage = provider => {
  if (!providers.value.includes(provider)) return;
  if (!(mode.value === provider && state.current === 'clock')) CT.send({ type: 'refreshUsage' });
  mode.value = provider;
  CT.show('clock');
};
// A finished timer counts up past its time until you leave the timer (or ten minutes pass).
watch(() => mode.value === 'timer' && state.current === 'clock', up => {
  if (up) return;
  clearTimeout(settleTimer);
  removeDoneTimers();
});
screen.swipe = direction => {
  if (mode.value !== 'timer') return false;
  restOn(restPosition.value + direction);
};
// Dragging the deck: the stripe moves with the finger (a little past either end at most).
screen.drag = dx => {
  if (mode.value !== 'timer' || timerView.value !== 'deck') return false;
  if (dragPosition.value == null) { dragFrom = restPosition.value; clearTimeout(settleTimer); }
  dragPosition.value = Math.max(-0.2, Math.min(cards.value.length + 0.2, positionAt(firstCardAt(dragFrom) + dx)));
};
screen.dragEnd = (dx, vx) => {
  const position = dragPosition.value == null ? restPosition.value : dragPosition.value;
  dragPosition.value = null;
  restOn(Math.abs(vx) > FLICK_PX_MS ? (vx < 0 ? Math.ceil(position) : Math.floor(position)) : Math.round(position));
};
let lastPress = 0;
screen.press = () => {
  if (mode.value !== 'timer') return false;
  const card = focused.value, t = performance.now();
  const twice = t - lastPress < (CT.config.multiClickMs || 350);
  lastPress = twice ? 0 : t;
  if (card.kind === 'last') return void startFromPreset(card.total / 60000);
  if (card.kind !== 'timer') return void zoom(); // a meeting's countdown can't be paused
  if (twice) removeTimer(card.id);
  else toggleTimer(card.id);
  if (timerView.value === 'deck') settle();
};
</script>
<template>
  <section id="screen-clock" class="screen fill flex" :class="{ active: state.current === 'clock', leaving: state.leaving === 'clock', timer: mode === 'timer', 'timer-deck': mode === 'timer' && timerView === 'deck' }">
    <LeftRail :view="mode" :views="railViews" :truncate-lower="!resets" @click="backToDeck">
      <template #lower>
        <template v-if="resets"><div class="usage-resets">Resets: Session <b class="primary medium">{{ resets.session }}</b> · Week <b class="primary medium">{{ resets.week }}</b></div></template>
        <template v-else-if="next">{{ CT.timeText(next.start) }} <b class="primary medium">{{ next.title }}</b></template><template v-else-if="state.calendar.status === 'ok'">No events today</template>
      </template>
    </LeftRail>
    <ScreenStage class="bg-panel">
      <!-- Every view stays drawn and only fades (see .fade-view), so a press doesn't have to build and
           paint the incoming one while the other is fading out. -->
      <div class="fade-view c-view-timer fill" :class="{ on: mode === 'timer' }" @click="backToDeck"><TimeTimer :remaining="focused.remaining" :total="focused.total" :idle="focused.status === 'set'" /><div v-if="timerResets" class="back-action font-small medium primary">reset <BackActionIcon name="refresh" /></div></div>
      <div v-for="p in providers" :key="p" class="fade-view fill" :class="{ on: mode === p }"><ClaudeUsage :provider="p" /></div>
      <div class="fade-view fill" :class="{ on: mode === 'clock' }">
        <AnalogClock v-if="face !== 'digital'" :numbers="face === 'numbers'" :now="state.current === 'clock' ? state.now : 0" />
        <div v-else class="c-digital fill"><span>{{ digits.hours }}</span><span class="c-digital-minutes"><span>:</span><span>{{ digits.minutes }}</span></span></div>
      </div>
    </ScreenStage>
    <TimerDeck :cards="cards" :focus="focusIndex" :position="deckPosition" :dragging="dragPosition != null" :on="mode === 'timer' && timerView === 'deck'" :zooming="zooming" :clock="time.time" :next="next ? { time: CT.timeText(next.start), title: next.title } : null" @start="startFromPreset" @pick="pickCard" />
  </section>
</template>
