<template>
  <FrappeUIProvider>
    <div class="flex min-h-screen bg-surface-gray-1 text-base text-ink-gray-9">
      <div class="hidden shrink-0 md:block"><SideNav /></div>

      <div v-if="drawer" class="fixed inset-0 z-40 md:hidden">
        <div class="hr-scrim absolute inset-0" @click="drawer = false" />
        <div class="absolute inset-y-0 start-0 shadow-lg"><SideNav @navigate="drawer = false" /></div>
      </div>

      <div class="flex min-w-0 flex-1 flex-col">
        <div class="flex items-center gap-2 border-b border-outline-gray-1 bg-surface-base px-4 py-2 md:hidden">
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-md text-ink-gray-8"
            :aria-label="__('Menu')"
            :aria-expanded="drawer ? 'true' : 'false'"
            @click="drawer = true"
          >
            <span class="lucide-menu size-5" aria-hidden="true" />
          </button>
          <span class="font-semibold">{{ __('Human Resources') }}</span>
        </div>
        <main class="min-w-0 flex-1 px-4 pb-12 pt-6 sm:px-6">
          <div class="mx-auto flex max-w-[1120px] flex-col gap-4">
            <router-view />
          </div>
        </main>
      </div>
    </div>
  </FrappeUIProvider>
</template>

<script setup>
import { FrappeUIProvider } from 'frappe-ui'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import SideNav from '@/components/SideNav.vue'

const drawer = ref(false)
watch(useRoute(), () => (drawer.value = false))
</script>
