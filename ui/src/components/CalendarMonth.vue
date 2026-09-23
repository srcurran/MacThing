<script setup>
import { computed } from "vue";
import { CT } from "../state.js";
// This month as a grid, Sunday first, with today circled (Figma 154:4958).
const props = defineProps({ now: Number });
const month = computed(() => {
  const p = CT.parts(props.now);
  const length = new Date(Date.UTC(p.year, p.month + 1, 0)).getUTCDate();
  const first = (((p.day - (p.date - 1)) % 7) + 7) % 7; // weekday of the 1st
  const cells = Array.from({ length: first }, () => null).concat(
    Array.from({ length }, (_, i) => i + 1),
  );
  while (cells.length % 7) cells.push(null); // so the last week keeps its columns
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { name: CT.MONTHS[p.month], today: p.date, weeks };
});
</script>
<template>
  <div class="k-month flex-col">
    <div class="k-month-name font-small semibold">{{ month.name }}</div>
    <div class="k-week k-weekdays font-small semibold muted">
      <span v-for="(d, i) in CT.DAYS" :key="i">{{ d[0] }}</span>
    </div>
    <div
      v-for="(week, w) in month.weeks"
      :key="w"
      class="k-week font-small bold"
    >
      <span
        v-for="(date, i) in week"
        :key="i"
        :class="{ muted: i === 0 || i === 6 }"
        ><svg v-if="date === month.today" class="k-today" viewBox="0 0 40 40">
          <!-- The date is cut out of the circle, so whatever is behind shows through it. -->
          <mask id="k-today-cut">
            <rect width="40" height="40" fill="#fff" />
            <text x="20" y="28" text-anchor="middle" fill="#000">{{ date }}</text>
          </mask>
          <circle cx="20" cy="20" r="20" mask="url(#k-today-cut)" /></svg
        ><template v-else>{{ date }}</template></span
      >
    </div>
  </div>
</template>
