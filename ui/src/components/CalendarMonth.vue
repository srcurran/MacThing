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
        ><svg v-if="date === month.today" class="k-today" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="28" />
          <text x="28" y="36" text-anchor="middle">{{ date }}</text></svg
        ><template v-else>{{ date }}</template></span
      >
    </div>
  </div>
</template>
