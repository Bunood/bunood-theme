<template>
  <nav
    :aria-label="__('HR')"
    class="flex h-full w-60 flex-col gap-0.5 border-e border-outline-gray-1 bg-surface-sidebar px-3 py-4"
  >
    <div class="flex items-center gap-2.5 px-2 pb-3.5">
      <span
        aria-hidden="true"
        class="hr-num flex size-[34px] items-center justify-center rounded-md text-sm font-bold"
        :style="{ background: 'var(--tone-done)', color: 'var(--tone-on-done)' }"
        >01</span
      >
      <div class="leading-tight">
        <div class="text-base font-bold text-ink-gray-9">{{ __('Zero One') }}</div>
        <div class="text-sm text-ink-gray-7">{{ __('Human Resources') }}</div>
      </div>
    </div>

    <router-link
      v-for="item in items"
      :key="item.name"
      :to="{ name: item.name }"
      class="flex min-h-[38px] items-center gap-2.5 rounded-md px-2.5 text-base text-ink-gray-7 no-underline hover:bg-surface-gray-2 aria-[current=page]:bg-surface-gray-3 aria-[current=page]:font-semibold aria-[current=page]:text-ink-gray-9"
      @click="$emit('navigate')"
    >
      <span :class="[item.icon, 'size-[18px] shrink-0']" aria-hidden="true" />
      {{ item.label }}
    </router-link>

    <div class="mx-2 mb-1 mt-3.5 h-px bg-surface-gray-4" />
    <a
      href="/app"
      class="flex min-h-[38px] items-center gap-2.5 rounded-md px-2.5 text-base text-ink-gray-7 no-underline hover:bg-surface-gray-2"
    >
      <span class="lucide-layout-grid size-[18px] shrink-0" aria-hidden="true" />
      {{ __('All apps') }}
    </a>

    <div class="mt-auto pt-5">
      <div class="flex items-center gap-2.5 rounded-lg border border-outline-gray-1 bg-surface-base p-2.5">
        <span
          aria-hidden="true"
          class="flex size-8 items-center justify-center rounded-full bg-surface-gray-3 font-bold text-ink-gray-9"
          >{{ initials(boot.fullName) }}</span
        >
        <div class="min-w-0 leading-snug">
          <div class="truncate text-sm font-semibold text-ink-gray-9">{{ boot.fullName }}</div>
          <a href="/app/user/me" class="text-sm text-ink-blue-link">{{ __('My account') }}</a>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
// A destination the reader cannot open is not offered; the screens behind the
// links still refuse on the server. Each item keeps one Lucide icon, the same
// everywhere it appears.
import { boot } from '@/boot'
import { initials } from '@/format'
import { __ } from '@/i18n'

defineEmits(['navigate'])

const items = [
  { name: 'Today', label: __('Today'), icon: 'lucide-sun' },
  { name: 'Employees', label: __('Employees'), icon: 'lucide-users' },
  { name: 'Attendance', label: __('Attendance'), icon: 'lucide-clock' },
]
</script>
