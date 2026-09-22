<script setup>
import { computed, ref, watch, nextTick, onMounted } from "vue";
import { state, CT } from "../state.js";
import LeftRail from "../components/LeftRail.vue";
import ScreenStage from "../components/ScreenStage.vue";
import StageMessage from "../components/StageMessage.vue";
import CalendarEvent from "../components/CalendarEvent.vue";
const rail = ref(null),
  list = ref(null),
  kept = ref([]);
const parts = computed(() => CT.parts(state.now));
const time = computed(() => CT.clockText(parts.value).time);
const days = computed(() => state.settings.calendarDays || 2);
const sections = computed(() => {
  if (state.calendar.status !== "ok") return [];
  const today = CT.dayNumber(state.now);
  return Array.from({ length: days.value }, (_, i) => ({
    label:
      i === 0
        ? "Today"
        : i === 1
          ? "Tomorrow"
          : CT.DAYS[CT.parts(state.now + i * 86400000).day],
    events: state.calendar.events
      .filter((e) =>
        i === 0
          ? e.end > state.now && CT.dayNumber(e.start) <= today
          : CT.dayNumber(e.start) === today + i,
      )
      .sort((a, b) => b.allDay - a.allDay || a.start - b.start),
  })).filter((s) => s.events.length);
});
const message = computed(() => {
  const status = state.calendar.status;
  if (["denied", "restricted", "writeOnly"].includes(status))
    return {
      title: "Calendar access is off",
      detail:
        "Allow “Car Thing Helper” in System Settings → Privacy & Security → Calendars.",
    };
  if (["loading", "notDetermined"].includes(status))
    return { title: "Loading your calendar…" };
  if (status !== "ok")
    return { title: "Calendar unavailable", detail: "Trying again shortly." };
  if (!sections.value.length)
    return {
      title: "Nothing scheduled",
      detail:
        days.value > 1
          ? "The next " + days.value + " days are clear."
          : "The rest of the day is clear.",
    };
  return {};
});
// JS overrides the CSS display-size fallback only when the current time is too wide.
function fitClock() {
  const clock = rail.value && rail.value.titleElement;
  if (!clock) return;
  clock.style.fontSize = "";
  for (let size = 112; clock.scrollWidth > clock.clientWidth && size > 72; ) {
    size -= 8;
    clock.style.fontSize = size + "px";
  }
}
let generation = 0;
async function fitEvents() {
  const run = ++generation;
  kept.value = sections.value.map((s) => ({ ...s, shown: s.events.length }));
  await nextTick();
  while (
    run === generation &&
    list.value &&
    list.value.scrollHeight > list.value.clientHeight
  ) {
    let largest = -1;
    kept.value.forEach((s, i) => {
      if (s.shown > 1 && (largest < 0 || s.shown >= kept.value[largest].shown))
        largest = i;
    });
    if (largest >= 0) kept.value[largest].shown--;
    else if (kept.value.length > 1) kept.value.pop();
    else break;
    await nextTick();
  }
}
watch(
  () => [
    state.calendar,
    state.settings,
    Math.floor(state.now / 60000),
    state.current,
  ],
  () => {
    nextTick(fitClock);
    fitEvents();
  },
);
CT.screen("calendar").show = () => {
  nextTick(fitClock);
  fitEvents();
};
onMounted(() => {
  fitClock();
  fitEvents();
  if (document.fonts)
    document.fonts.ready.then(() => {
      fitClock();
      fitEvents();
    });
});
</script>
<template>
  <section
    id="screen-calendar"
    class="screen fill flex"
    :class="{ active: state.current === 'calendar' }"
  >
    <LeftRail
      ref="rail"
      variant="time"
      :eyebrow="CT.DAYS[parts.day] + ' ' + (parts.month + 1) + '/' + parts.date"
      :title="time"
    />
    <ScreenStage class="bg-panel">
      <div ref="list" class="k-list overflow-hidden stage-safe">
        <template v-for="section in kept" :key="section.label">
          <div v-if="section.label" class="k-day font-small medium muted">
            {{ section.label }}
          </div>
          <CalendarEvent
            v-for="(event, i) in section.events.slice(0, section.shown)"
            :key="i"
            :event="event"
            :now="state.now"
          />
          <div
            v-if="section.events.length > section.shown"
            class="mt-16 font-small medium muted"
          >
            +{{ section.events.length - section.shown }} more
          </div>
        </template>
      </div>
      <StageMessage :title="message.title" :detail="message.detail" />
    </ScreenStage>
  </section>
</template>
