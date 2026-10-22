<template>
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div class="min-w-0">
      <div v-if="trail" class="text-sm text-ink-gray-5">{{ trail }}</div>
      <h1 class="mt-0.5 text-2xl font-semibold text-ink-gray-9">{{ title }}</h1>
      <div v-if="$slots.default" class="text-sm text-ink-gray-7"><slot /></div>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap gap-2"><slot name="actions" /></div>
  </header>
</template>

<script setup>
defineProps({ title: { type: String, required: true }, trail: { type: String, default: '' } })
</script>
