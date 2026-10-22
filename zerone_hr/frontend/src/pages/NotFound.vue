<template>
  <EmptyState :title="__('This page does not exist.')" :hint="__('It may have moved, or the link is incomplete.')">
    <router-link :to="{ name: 'Today' }" class="text-sm text-ink-blue-link">{{ __('Back to today') }}</router-link>
  </EmptyState>
</template>

<script setup>
import EmptyState from '@/components/EmptyState.vue'
</script>
