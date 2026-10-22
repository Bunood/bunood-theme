<template>
  <PageHeader :trail="__('Human Resources')" :title="__('Employees')">
    <template v-if="list.data">
      {{ count(list.data.counts.all, '{0} employees') }} ·
      {{ __('Saudization {0}', [percent(list.data.saudization)]) }}
    </template>
    <template #actions>
      <a href="/app/employee/new" :class="solid">{{ __('New employee') }}</a>
    </template>
  </PageHeader>

  <div class="flex flex-wrap items-center justify-between gap-2.5">
    <div role="group" :aria-label="__('Show')" class="flex flex-wrap gap-1.5">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        :aria-pressed="tab === t.key ? 'true' : 'false'"
        class="h-[34px] rounded-full px-3.5 text-sm"
        :class="tab === t.key ? 'bg-surface-gray-10 font-semibold text-ink-base' : 'border border-outline-gray-1 bg-surface-base text-ink-gray-7'"
        @click="pick(t.key)"
      >
        {{ t.label }} <span class="hr-num">{{ list.data?.counts[t.key] ?? '' }}</span>
      </button>
    </div>
    <label class="flex h-9 items-center gap-1.5 rounded-md border border-outline-gray-2 bg-surface-base px-2.5 text-ink-gray-5">
      <span class="lucide-search size-4" aria-hidden="true" />
      <span class="sr-only">{{ __('Search') }}</span>
      <input
        v-model="search"
        type="search"
        :placeholder="__('Name or employee ID')"
        class="w-48 border-0 bg-transparent p-0 text-base text-ink-gray-9 focus:ring-0"
      />
    </label>
  </div>

  <ErrorBox v-if="list.error" :message="list.error.messages?.join(' ') || list.error.message" @retry="list.reload()" />

  <section v-else :aria-label="__('Employee list')" class="overflow-hidden rounded-lg border border-outline-gray-1 bg-surface-base">
    <div class="overflow-x-auto">
      <table class="w-full min-w-[900px] border-collapse" :aria-busy="list.loading ? 'true' : 'false'">
        <thead>
          <tr class="bg-surface-gray-1 text-sm text-ink-gray-7">
            <th scope="col" class="px-3.5 py-2.5 text-start font-medium">{{ __('Employee') }}</th>
            <th scope="col" class="px-3.5 py-2.5 text-start font-medium">{{ __('Department') }}</th>
            <th scope="col" class="px-3.5 py-2.5 text-start font-medium">{{ __('Nationality') }}</th>
            <th scope="col" class="px-3.5 py-2.5 text-start font-medium">{{ __('Joined') }}</th>
            <th scope="col" class="px-3.5 py-2.5 text-end font-medium">{{ __('Basic salary') }}</th>
            <th scope="col" class="px-3.5 py-2.5 text-start font-medium">{{ __('Today') }}</th>
            <th scope="col" class="px-3.5 py-2.5 text-start font-medium">{{ __('Status') }}</th>
          </tr>
        </thead>
        <tbody :class="list.loading && rows.length ? 'opacity-60' : ''">
          <tr v-for="e in rows" :key="e.employee" class="border-t border-outline-gray-1 hover:bg-surface-gray-2">
            <td class="px-3.5 py-2.5">
              <a :href="`/app/employee/${encodeURIComponent(e.employee)}`" class="font-semibold text-ink-gray-9 no-underline">{{
                e.employee_name
              }}</a>
              <div class="text-sm text-ink-gray-7">{{ e.designation }}</div>
            </td>
            <td class="px-3.5 py-2.5">{{ e.department || '—' }}</td>
            <td class="px-3.5 py-2.5">{{ e.nationality ? __(e.nationality) : '—' }}</td>
            <td class="px-3.5 py-2.5"><span class="hr-num">{{ day(e.date_of_joining) }}</span></td>
            <td class="px-3.5 py-2.5 text-end">
              <MoneyAmount v-if="e.base" :value="e.base" :currency="e.currency || 'SAR'" />
              <span v-else class="text-ink-gray-5">—</span>
            </td>
            <td class="px-3.5 py-2.5">
              <StatusPill v-if="e.today" :kind="todayKind[e.today]">
                {{ todayWord(e) }}
              </StatusPill>
            </td>
            <td class="px-3.5 py-2.5">
              <StatusPill :kind="status(e).kind">{{ status(e).word }}</StatusPill>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <EmptyState
      v-if="list.data && !rows.length"
      :title="search ? __('No employee matches “{0}”.', [search]) : __('Nobody in this list.')"
    />
    <div v-if="!list.data && list.loading" aria-busy="true">
      <div v-for="i in 6" :key="i" class="h-12 animate-pulse border-t border-outline-gray-1 bg-surface-gray-2" />
    </div>
    <div v-if="list.data" class="flex flex-wrap items-center justify-between gap-2.5 bg-surface-gray-1 px-4 py-3 text-sm text-ink-gray-7">
      <span>{{ __('Showing {0}–{1} of {2}', [list.data.total ? start + 1 : 0, start + rows.length, list.data.total]) }}</span>
      <span class="flex gap-1.5">
        <button type="button" :class="ghost" :disabled="start === 0" @click="page(-1)">{{ __('Previous') }}</button>
        <button type="button" :class="ghost" :disabled="start + rows.length >= list.data.total" @click="page(1)">
          {{ __('Next') }}
        </button>
      </span>
    </div>
  </section>
</template>

<script setup>
import { createResource, debounce } from 'frappe-ui'
import { computed, ref, watch } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import ErrorBox from '@/components/ErrorBox.vue'
import MoneyAmount from '@/components/MoneyAmount.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusPill from '@/components/StatusPill.vue'
import { boot } from '@/boot'
import { day, percent } from '@/format'
import { __, count } from '@/i18n'

const PAGE = 50
const ghost = 'h-8 rounded-md border border-outline-gray-2 bg-surface-base px-3 text-sm text-ink-gray-8 disabled:opacity-50'
const solid = 'flex h-9 items-center rounded-md bg-surface-gray-10 px-4 text-sm font-semibold text-ink-base no-underline'

const tab = ref('all')
const search = ref('')
const start = ref(0)

const list = createResource({
  url: 'zerone_hr.api.employees.get_employees',
  makeParams: () => ({ company: boot.company, tab: tab.value, search: search.value, start: start.value, page_length: PAGE }),
  auto: true,
})

const tabs = [
  { key: 'all', label: __('All') },
  { key: 'saudi', label: __('Saudi') },
  { key: 'non_saudi', label: __('Non-Saudi') },
  { key: 'probation', label: __('On probation') },
  { key: 'documents', label: __('Documents expiring') },
  { key: 'left', label: __('Left') },
]

function pick(key) {
  tab.value = key
  start.value = 0
  list.reload()
}

function page(by) {
  start.value = Math.max(0, start.value + by * PAGE)
  list.reload()
}

watch(
  search,
  debounce(() => {
    start.value = 0
    list.reload()
  }, 300),
)

const rows = computed(() => list.data?.rows || [])

const todayKind = { present: 'good', late: 'late', absent: 'refused', not_yet: 'neutral', leave: 'neutral', duty: 'waiting', off: 'neutral' }

function todayWord(e) {
  if (e.today === 'present') return __('Present {0}', [e.first_in || ''])
  if (e.today === 'late') return count(e.late_minutes, '{0} min late')
  return { absent: __('Absent'), not_yet: __('Not in yet'), leave: __('On leave'), duty: __('On duty'), off: __('Day off') }[e.today]
}

function status(e) {
  if (e.status === 'Left') return { kind: 'neutral', word: __('Left') }
  if (e.document) return { kind: 'late', word: __('{0} expiring', [__(e.document.document)]) }
  if (tab.value === 'probation' || (e.date_of_joining && Date.now() - new Date(e.date_of_joining) < 90 * 864e5)) {
    return { kind: 'waiting', word: __('On probation') }
  }
  return { kind: 'neutral', word: __('Active') }
}
</script>
