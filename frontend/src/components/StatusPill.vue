<template>
  <span
    class="inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2.5 text-sm font-medium"
    :class="classes"
    :style="kind === 'done' ? doneStyle : undefined"
  >
    <slot />
  </span>
</template>

<script setup>
// Where something stands, in a word, coloured by its tone. The word carries the
// meaning; the colour repeats it. Never pass a colour, pass the kind.
import { computed } from 'vue'

const props = defineProps({
  kind: {
    type: String,
    default: 'neutral',
    validator: (k) => ['neutral', 'waiting', 'good', 'done', 'late', 'refused'].includes(k),
  },
})

// The bridge's steps only: a 5% wash (step 2) under the status colour (step 7).
const TONES = {
  neutral: 'bg-surface-gray-2 text-ink-gray-7',
  waiting: 'bg-surface-blue-2 text-ink-blue-7',
  good: 'bg-surface-green-2 text-ink-green-7',
  late: 'bg-surface-amber-2 text-ink-amber-7',
  refused: 'bg-surface-red-2 text-ink-red-7',
  done: '',
}

const classes = computed(() => TONES[props.kind])
const doneStyle = { background: 'var(--tone-done)', color: 'var(--tone-on-done)' }
</script>
