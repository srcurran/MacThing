<script setup>
defineProps({ label: String, value: String, selected: Boolean, link: Boolean });
</script>
<template>
  <div class="s-row flex items-center justify-between gap-16 font-small" :class="{ sel: selected }">
    <span class="medium">{{ label }}</span><span class="s-value semibold muted truncate" :class="{ link }">{{ value }}</span>
  </div>
</template>
