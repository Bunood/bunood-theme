<template>
  <span class="hr-num whitespace-nowrap">
    {{ money(value) }}&thinsp;<span v-if="currency === 'SAR'" class="hr-riyal">{{ RIYAL }}</span
    ><span v-else>{{ currency }}</span>
  </span>
</template>

<script setup>
import { money, RIYAL } from '@/format'

defineProps({
  value: { type: [Number, String], default: 0 },
  currency: { type: String, default: 'SAR' },
})
</script>
