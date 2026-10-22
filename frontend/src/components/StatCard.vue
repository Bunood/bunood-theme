<template>
  <component
    :is="to ? 'router-link' : 'div'"
    :to="to"
    class="flex flex-col gap-0.5 rounded-lg border border-outline-gray-1 bg-surface-base px-4 py-3.5 text-ink-gray-9 no-underline transition-colors hover:bg-surface-gray-2"
  >
    <span class="text-sm text-ink-gray-7">{{ label }}</span>
    <span class="text-3xl font-semibold leading-tight">
      <span class="hr-num">{{ figure }}</span>
      <span v-if="of" class="ms-1 text-base font-normal text-ink-gray-7">{{ of }}</span>
    </span>
    <span v-if="note" class="text-sm" :class="noteClass">{{ note }}</span>
  </component>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  figure: { type: [Number, String], required: true },
  of: { type: String, default: '' },
  note: { type: String, default: '' },
  tone: { type: String, default: 'neutral' },
  to: { type: [String, Object], default: null },
})

const noteClass = computed(
  () =>
    ({
      neutral: 'text-ink-gray-7',
      late: 'font-semibold text-ink-amber-7',
      refused: 'font-semibold text-ink-red-7',
    })[props.tone],
)
</script>
