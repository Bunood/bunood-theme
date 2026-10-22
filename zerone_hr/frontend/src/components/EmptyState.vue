<template>
  <div class="px-5 py-8 text-center">
    <div class="text-base font-medium text-ink-gray-8">{{ title }}</div>
    <div v-if="hint" class="mt-1 text-sm text-ink-gray-7">{{ hint }}</div>
    <div v-if="$slots.default" class="mt-3"><slot /></div>
  </div>
</template>

<script setup>
defineProps({ title: { type: String, required: true }, hint: { type: String, default: '' } })
</script>
