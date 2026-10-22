<template>
  <section
    :aria-labelledby="titleId"
    class="flex flex-col overflow-hidden rounded-lg border border-outline-gray-1 bg-surface-base"
  >
    <div v-if="title" class="flex items-center justify-between gap-3 px-5 pb-2.5 pt-4">
      <h2 :id="titleId" class="text-lg font-semibold text-ink-gray-9">{{ title }}</h2>
      <slot name="aside" />
    </div>
    <slot />
  </section>
</template>

<script setup>
import { useId } from 'vue'

defineProps({ title: { type: String, default: '' } })
const titleId = useId()
</script>
