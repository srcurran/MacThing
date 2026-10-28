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
import { cards, timerOnScreen, startTimer, toggleTimer, removeTimer, removeCard, removeDoneTimers } from '../timer.js';
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
screen.reselect = (steps = 1) => {
  const n = modes.value.length;
  mode.value = modes.value[(((modes.value.indexOf(mode.value) + steps) % n) + n) % n];
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
// go moving, the next one that way. A swipe on the full-size timer pages to the next one, full
// size (see "Paging" below). Resting on a card that's counting for 5 seconds zooms it up to full size. Tapping a
// preset starts another timer and moves to its card; tapping a card zooms it up to full size.
// Full size, a tap on the dial starts the last length used, and pauses or restarts a timer of
// yours (as the knob does); a tap anywhere else on the screen goes back to the deck. Swiping a card up lifts it off a Remove (Apple Watch faces' way): let go
// lifted far enough (or flicked) and it stays up, Remove showing; tap Remove to remove it, or swipe
// it back down, tap it or press back to keep it. The last length used is always there: it lifts a
// little and drops back. The knob press starts or pauses the timer you're on (twice:
// puts it away); the back button puts away a paused or finished one, and the corner says so.
// Turning the knob sets the volume.
const SETTLE_MS = 5000, ZOOM_MS = 350, FRAME_MS = 40;
const focusId = ref('last');
const timerView = ref('deck'); // 'deck' | 'timer'
const zooming = ref(false);
const instant = ref(false); // switching between the deck and the full-size timer with no fade
const atPresets = ref(true); // resting on the presets (the first card beside them, in focus)
const dragPosition = ref(null); // the stripe's position while a finger drags it
let lastFocus = 0, settleTimer = null, zoomTimer = null, dragFrom = 0;
const FLICK_PX_MS = 0.3;
// Lifting the card in focus to remove it: how far it rests up (Remove showing), how far up it
// must be let go to stay there, and how far the last length used gives before dropping back.
const LIFT_PX = 160, LIFT_ARM_PX = 70, LAST_GIVE_PX = 24;
const lift = ref(0), lifting = ref(false), removing = ref(false);
let liftFrom = 0;
function keepCard() {
  removing.value = false;
  lifting.value = false;
  lift.value = 0;
}
function removeFocused() {
  const card = focused.value;
  keepCard();
  removeCard(card);
  settle();
}
const focusIndex = computed(() => {
  const i = cards.value.findIndex(c => c.id === focusId.value);
  return i >= 0 ? i : Math.min(lastFocus, cards.value.length - 1);
});
const focused = computed(() => cards.value[focusIndex.value]);
// Where the deck rests: 0 on the presets, then 1, 2… with that card centred (TimerDeck.vue).
const restPosition = computed(() => (atPresets.value ? 0 : focusIndex.value + 1));
const deckPosition = computed(() => (dragPosition.value == null ? restPosition.value : dragPosition.value));
// A card that's gone (a meeting over, a timer put away) leaves the focus on the one that took its
// place, and the full-size view goes back to the deck. A meeting's countdown to its start, as the
// meeting begins, carries on as its countdown to its end, full size if it was.
watch(focusIndex, i => { lastFocus = i; });
watch(() => focused.value.id, id => {
  if (id === focusId.value) return;
  const started = focusId.value.indexOf('start|') === 0 && cards.value.find(c => c.id === 'end|' + focusId.value.slice(6));
  if (started) { focusId.value = started.id; return; }
  focusId.value = id;
  if (timerView.value === 'timer') timerView.value = 'deck';
});
watch(() => state.current === 'clock' && mode.value === 'timer', up => { timerOnScreen.value = up; }, { immediate: true });
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
// The card grows to fill the screen first (the rest of the deck fading away), then, at full size,
// the full-size timer takes its place with no fade: it looks the same, so the swap can't be seen.
// Back to the deck is the same in reverse.
// Turns the fades back on after a swap made with them off (instant). The device can take longer
// than FRAME_MS to get to the swap, so first make it work out the swapped styles, fades still off:
// otherwise the fades come back on first and play the swap, each at its own pace (the rail's
// next-event line before its time and the dial, which wait 0.3s, see .fade-view.on).
function endInstant() {
  const el = document.getElementById('screen-clock');
  if (el) void el.offsetHeight;
  instant.value = false;
}
function zoom() {
  clearTimeout(settleTimer);
  if (mode.value !== 'timer' || timerView.value !== 'deck' || lift.value || zooming.value) return;
  zooming.value = true;
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => {
    instant.value = true;
    timerView.value = 'timer';
    zoomTimer = setTimeout(() => { endInstant(); zooming.value = false; }, FRAME_MS);
  }, ZOOM_MS);
}
// then runs once the card's starting to shrink, in the same frame (a swipe moves the deck then).
function unzoom(then) {
  clearTimeout(zoomTimer);
  instant.value = true;
  zooming.value = true;
  timerView.value = 'deck';
  zoomTimer = setTimeout(() => { endInstant(); zooming.value = false; if (then) then(); }, FRAME_MS);
}
/** Opening the timer: on the card asked for (full size); else back where it was left (the deck
 *  where it rested, or that card full size), unless that card's gone or its timer has finished;
 *  else on a timer of yours if one's going (full size), else the deck from its start. */
let timerOpened = false;
function openTimer(id) {
  clearTimeout(settleTimer);
  const left = !id && timerOpened && cards.value.some(c => c.id === focusId.value)
    && !(focused.value.kind === 'timer' && focused.value.status === 'done');
  timerOpened = true;
  if (left) {
    if (timerView.value === 'deck') settle();
    return;
  }
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
// The last length used, started from its card: full size, it stays full size, on the new timer.
function startLast(minutes) {
  if (timerView.value === 'timer') { focusId.value = startTimer(minutes); atPresets.value = false; }
  else startFromPreset(minutes);
}
function pickCard(id) {
  if (lift.value) return keepCard();
  focusId.value = id;
  atPresets.value = false;
  zoom();
}
function backToDeck() {
  if (mode.value !== 'timer' || timerView.value !== 'timer') return;
  unzoom();
  atPresets.value = false;
  settle();
}
// Full size, a tap on the dial pauses or restarts a timer of yours, and starts the last length
// used; on a meeting's countdown (which can't be paused) or a finished timer it goes back to the
// deck, as a tap anywhere else on the screen does.
function tapTimer() {
  if (mode.value !== 'timer' || timerView.value !== 'timer') return;
  const card = focused.value;
  if (card.kind === 'last') return startLast(card.total / 60000);
  if (card.kind === 'timer' && (card.status === 'running' || card.status === 'paused')) return toggleTimer(card.id);
  backToDeck();
}
const timerResets = computed(() => focused.value.kind === 'timer' && (focused.value.status === 'paused' || focused.value.status === 'done'));
function timerBackPress() {
  if (lift.value) return void keepCard();
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
// The full-size timer (its rail and dial) is only drawn while it's what's showing, so it can't
// show through as the deck, or another view, fades in or out over it. Under the deck, the rail
// shows nothing.
const timerFull = computed(() => mode.value === 'timer' && timerView.value === 'timer');
const railView = computed(() => (mode.value === 'timer' && !timerFull.value ? 'deck' : mode.value));
const railViews = computed(() => {
  const views = { clock: { eyebrow: CT.MONTHS[parts.value.month], title: parts.value.date, subtitle: CT.DAYS[parts.value.day] }, timer: { eyebrow: focused.value.label, title: focused.value.title, subtitle: time.value.time }, deck: { title: '' } };
  providers.value.forEach(p => { views[p] = usageRail(p); });
  return views;
});
// On a usage, the line at the bottom is when its windows reset instead of the next event.
// Each usage view's reset times (null until it has a reading), all kept so the rail's bottom line
// can crossfade with the rest of the view instead of swapping as the swap starts.
const resetsByProvider = computed(() => {
  const out = {}; // no Object.fromEntries on the device's Chromium 69
  for (const p of providers.value) {
    const u = usageOf(state, p);
    out[p] = u.status === 'ok' ? { session: untilText(u.session.resetsAt, state.now, SESSION_MS), week: untilText(u.week.resetsAt, state.now, WEEK_MS) } : null;
  }
  return out;
});
const resets = computed(() => (isUsage(mode.value) && resetsByProvider.value[mode.value]) || null);
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
  if (page.value || pageSettling) { pageDrag = false; finishPage(false); }
  clearTimeout(settleTimer);
  keepCard();
  removeDoneTimers();
});
// ---- Paging between full-size timers (Figma 483:3135) --------------------------------------
// Swiped sideways, the full-size timer gives way to the next card's, full size too: the two
// cards' own copies take over (they look the same full size), and as the finger moves, the one
// going shrinks to card size and slides off while the next comes in beside it and grows back to
// full size (TimerDeck.vue draws it). Let go past halfway, or flicked, it carries on; otherwise
// it goes back. At the end, the full-size timer takes over again with no fade. Swiping towards the
// presets from the first card has nothing to page to: it goes back to the deck, on the presets.
const PAGE_MS = 450, PAGE_SPAN = 800 + 32; // a whole page: the screen and the gap between cards
const page = ref(null); // { from, to, dir, p }: card ids, +1 to the next (finger going left), 0–1
let pageFrame = 0, pageDrag = false, pageSettling = false;
function pageNeighbour(dir) {
  const j = focusIndex.value + dir;
  return j >= 0 && j < cards.value.length ? cards.value[j].id : null;
}
// The deck takes over from the full-size timer with nothing in between, then holds still
// (instant) while the frames are drawn here.
function startPage() {
  cancelAnimationFrame(pageFrame);
  clearTimeout(zoomTimer);
  clearTimeout(settleTimer);
  keepCard();
  zooming.value = false;
  instant.value = true;
  timerView.value = 'deck';
}
function finishPage(done) {
  cancelAnimationFrame(pageFrame);
  pageSettling = false;
  const pg = page.value;
  page.value = null;
  if (done && pg && cards.value.some(c => c.id === pg.to)) { focusId.value = pg.to; atPresets.value = false; }
  timerView.value = 'timer';
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(endInstant, FRAME_MS);
}
const easeOut = x => 1 - Math.pow(1 - x, 3);
const easeInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// Carries the page on to the end (done) or back to the start, from wherever the finger left it.
function settlePage(done, ease) {
  const pg = page.value;
  if (!pg) return finishPage(false);
  const from = pg.p, to = done ? 1 : 0, ms = Math.max(150, PAGE_MS * Math.abs(to - from)), t0 = performance.now();
  pageSettling = true;
  cancelAnimationFrame(pageFrame);
  const step = now => {
    const x = Math.min(1, (now - t0) / ms);
    page.value = { ...pg, p: from + (to - from) * (ease || easeOut)(x) };
    if (x < 1) pageFrame = requestAnimationFrame(step);
    else finishPage(done);
  };
  pageFrame = requestAnimationFrame(step);
}
/** One whole page on, as a swipe without a drag does (or nothing that way: back to the deck). */
function pageBy(dir) {
  const to = pageNeighbour(dir);
  if (!to) return void unzoom(() => restOn(restPosition.value + dir));
  startPage();
  page.value = { from: focused.value.id, to, dir, p: 0 };
  settlePage(true, easeInOut);
}
screen.swipe = direction => {
  if (mode.value !== 'timer' || pageSettling) return false;
  keepCard();
  if (timerView.value === 'timer') return void pageBy(direction);
  restOn(restPosition.value + direction);
};
// Full size, a sideways drag pages; the page follows the finger, either way.
function dragPage(dx) {
  const dir = dx < 0 ? 1 : -1, to = pageNeighbour(dir);
  if (!to) { if (page.value) page.value = { ...page.value, p: 0 }; return; }
  if (!page.value) startPage();
  page.value = { from: focused.value.id, to, dir, p: Math.min(1, Math.abs(dx) / PAGE_SPAN) };
}
function dragPageEnd(dx, vx) {
  pageDrag = false;
  const pg = page.value;
  if (!pg) {
    if (dx > 50 && !pageNeighbour(-1)) unzoom(() => restOn(0));
    return;
  }
  const along = -vx * pg.dir; // px/ms the page's way
  settlePage(Math.abs(vx) > FLICK_PX_MS ? along > 0 : pg.p > 0.5);
}
// Dragging the deck: sideways, the stripe moves with the finger (a little past either end at
// most); up and down, the card in focus lifts with it.
// Up and down lifts a card only when the finger started on one (or on the bin under it); anywhere
// else, it's left to core.js, which steps through the clock's views as on the other screens.
screen.drag = (dx, dy, axis, target) => {
  if (mode.value !== 'timer' || pageSettling) return false;
  if (pageDrag || timerView.value === 'timer') {
    if (axis !== 'x') return false;
    pageDrag = true;
    return void dragPage(dx);
  }
  if (timerView.value !== 'deck') return false;
  if (axis === 'y') {
    if (!lifting.value && !(target && target.closest && target.closest('.td-card, .td-remove'))) return false;
    if (!lifting.value) { lifting.value = true; liftFrom = lift.value; clearTimeout(settleTimer); }
    const up = liftFrom - dy;
    lift.value = focused.value.kind === 'last' ? Math.max(0, Math.min(LAST_GIVE_PX, up / 4)) : Math.max(0, Math.min(LIFT_PX + 24, up));
    return;
  }
  if (lift.value) keepCard();
  if (dragPosition.value == null) { dragFrom = restPosition.value; clearTimeout(settleTimer); }
  dragPosition.value = Math.max(-0.2, Math.min(cards.value.length + 0.2, positionAt(firstCardAt(dragFrom) + dx)));
};
screen.dragEnd = (dx, vx, axis, dy, vy) => {
  if (pageDrag) return dragPageEnd(dx, vx);
  if (axis === 'y') {
    const arm = focused.value.kind !== 'last' && (Math.abs(vy) > FLICK_PX_MS ? vy < 0 : lift.value > LIFT_ARM_PX);
    lifting.value = false;
    removing.value = arm;
    lift.value = arm ? LIFT_PX : 0;
    if (!arm) settle();
    return;
  }
  const position = dragPosition.value == null ? restPosition.value : dragPosition.value;
  dragPosition.value = null;
  restOn(Math.abs(vx) > FLICK_PX_MS ? (vx < 0 ? Math.ceil(position) : Math.floor(position)) : Math.round(position));
};
let lastPress = 0;
screen.press = () => {
  if (mode.value !== 'timer') return false;
  if (lift.value) return void keepCard();
  const card = focused.value, t = performance.now();
  const twice = t - lastPress < (CT.config.multiClickMs || 350);
  lastPress = twice ? 0 : t;
  if (card.kind === 'last') return void startLast(card.total / 60000);
  if (card.kind !== 'timer') return void zoom(); // a meeting's countdown can't be paused
  if (twice) removeTimer(card.id);
  else toggleTimer(card.id);
  if (timerView.value === 'deck') settle();
};
</script>
<template>
  <section id="screen-clock" class="screen fill flex" :class="{ active: state.current === 'clock', leaving: state.leaving === 'clock', timer: mode === 'timer', 'timer-deck': mode === 'timer' && timerView === 'deck', 'timer-instant': instant }">
    <LeftRail :view="railView" :views="railViews" :truncate-lower="false" @click="backToDeck">
      <template #lower>
        <div class="rail-lower-views">
          <div v-for="p in providers" :key="p" class="fade-view" :class="{ on: mode === p && !!resetsByProvider[p] }"><div v-if="resetsByProvider[p]" class="usage-resets">Resets: Session <b class="primary medium">{{ resetsByProvider[p].session }}</b> · Week <b class="primary medium">{{ resetsByProvider[p].week }}</b></div></div>
          <div class="fade-view truncate" :class="{ on: !resets }"><template v-if="next">{{ CT.timeText(next.start) }} <b class="primary medium">{{ next.title }}</b></template><template v-else-if="state.calendar.status === 'ok'">No events today</template></div>
        </div>
      </template>
    </LeftRail>
    <ScreenStage class="bg-panel">
      <!-- Every view stays drawn and only fades (see .fade-view), so a press doesn't have to build and
           paint the incoming one while the other is fading out. -->
      <div class="fade-view c-view-timer fill" :class="{ on: timerFull, paused: focused.kind === 'timer' && focused.status === 'paused' }" @click.stop="tapTimer"><TimeTimer :remaining="focused.remaining" :total="focused.total" :idle="focused.status === 'set'" /><div class="paused-glyph disc fill flex center"><svg><use href="#i-pause" /></svg></div><!-- the pause badge Now Playing shows, over the dial's centre --><div v-if="timerResets" class="back-action font-small medium primary">reset <BackActionIcon name="refresh" /></div></div>
      <div v-for="p in providers" :key="p" class="fade-view fill" :class="{ on: mode === p }"><ClaudeUsage :provider="p" /></div>
      <div class="fade-view fill" :class="{ on: mode === 'clock' }">
        <AnalogClock v-if="face !== 'digital'" :numbers="face === 'numbers'" :now="state.current === 'clock' ? state.now : 0" />
        <div v-else class="c-digital fill"><span>{{ digits.hours }}</span><span class="c-digital-minutes"><span>:</span><span>{{ digits.minutes }}</span></span></div>
      </div>
    </ScreenStage>
    <TimerDeck :cards="cards" :focus="focusIndex" :position="deckPosition" :dragging="dragPosition != null" :lift="lift" :lifting="lifting" :removing="removing" :on="mode === 'timer' && timerView === 'deck'" :zooming="zooming" :instant="instant" :page="page" :clock="time.time" :next="next ? { time: CT.timeText(next.start), title: next.title } : null" @start="startFromPreset" @pick="pickCard" @remove="removeFocused" />
  </section>
</template>
