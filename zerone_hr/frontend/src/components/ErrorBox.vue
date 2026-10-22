<template>
  <div role="alert" class="rounded-lg border border-outline-red-2 bg-surface-red-1 px-4 py-3 text-ink-red-7">
    <div class="font-semibold">{{ __('This page could not load.') }}</div>
    <div class="text-sm">{{ message }}</div>
    <button
      type="button"
      class="mt-2 h-8 rounded-md border border-outline-gray-2 bg-surface-base px-3 text-sm text-ink-gray-8"
      @click="$emit('retry')"
    >
      {{ __('Try again') }}
    </button>
  </div>
</template>

<script setup>
defineProps({ message: { type: String, default: '' } })
defineEmits(['retry'])
</script>
