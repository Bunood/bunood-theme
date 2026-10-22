<template>
  <PageHeader :trail="__('Attendance')" :title="title">
    {{ __('Read from check-ins, approved leave and duty requests; refreshed when you open the page.') }}
    <template #actions>
      <button type="button" :class="ghost" :aria-label="__('Previous day')" @click="shift(-1)">
        <span class="lucide-chevron-left size-4 rtl:hidden" aria-hidden="true" />
        <span class="lucide-chevron-right hidden size-4 rtl:inline-block" aria-hidden="true" />
      </button>
      <button type="button" :class="ghost" :disabled="isToday" @click="date = null">{{ __('Today') }}</button>
      <button type="button" :class="ghost" :aria-label="__('Next day')" :disabled="isToday" @click="shift(1)">
        <span class="lucide-chevron-right size-4 rtl:hidden" aria-hidden="true" />
        <span class="lucide-chevron-left hidden size-4 rtl:inline-block" aria-hidden="true" />
      </button>
      <a href="/app/employee-checkin/new" :class="solid">{{ __('Manual check-in') }}</a>
    </template>
  </PageHeader>

  <div role="group" :aria-label="__('Show')" class="flex flex-wrap gap-1.5">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      :aria-pressed="show === tab.key ? 'true' : 'false'"
      class="h-[34px] rounded-full px-3.5 text-sm"
      :class="show === tab.key ? 'bg-surface-gray-10 font-semibold text-ink-base' : 'border border-outline-gray-1 bg-surface-base text-ink-gray-7'"
      @click="setShow(tab.key)"
    >
      {{ tab.label }} <span class="hr-num">{{ tab.count }}</span>
    </button>
  </div>

  <ErrorBox v-if="sheet.error" :message="sheet.error.messages?.join(' ') || sheet.error.message" @retry="sheet.reload()" />

  <section v-else :aria-label="__('Attendance list')" class="overflow-hidden rounded-lg border border-outline-gray-1 bg-surface-base">
    <div class="overflow-x-auto">
      <table class="w-full min-w-[760px] border-collapse" :aria-busy="sheet.loading ? 'true' : 'false'">
        <thead>
          <tr class="bg-surface-gray-1 text-start text-sm text-ink-gray-7">
            <th scope="col" class="px-3 py-2.5 text-start font-medium">{{ __('Employee') }}</th>
            <th scope="col" class="px-3 py-2.5 text-start font-medium">{{ __('Shift') }}</th>
            <th scope="col" class="px-3 py-2.5 text-start font-medium">{{ __('In') }}</th>
            <th scope="col" class="px-3 py-2.5 text-start font-medium">{{ __('Out') }}</th>
            <th scope="col" class="px-3 py-2.5 text-start font-medium">{{ __('From') }}</th>
            <th scope="col" class="px-3 py-2.5 text-start font-medium">{{ __('Status') }}</th>
          </tr>
        </thead>
        <tbody :class="sheet.loading && rows.length ? 'opacity-60' : ''">
          <tr v-for="row in rows" :key="row.employee" class="border-t border-outline-gray-1">
            <td class="px-3 py-2.5">
              <a :href="`/app/employee/${encodeURIComponent(row.employee)}`" class="font-semibold text-ink-gray-9 no-underline">{{
                row.employee_name
              }}</a>
              <div class="text-sm text-ink-gray-7">{{ row.designation }}</div>
            </td>
            <td class="px-3 py-2.5">
              {{ row.shift || '—' }}
              <div v-if="row.shift_start" class="hr-num text-sm text-ink-gray-7">{{ row.shift_start }}–{{ row.shift_end }}</div>
            </td>
            <td class="px-3 py-2.5">
              <span class="hr-num font-semibold">{{ row.first_in || '—' }}</span>
              <div v-if="row.status === 'late'" class="text-sm font-semibold text-ink-amber-7">
                {{ count(row.late_minutes, '{0} min late') }}
              </div>
            </td>
            <td class="px-3 py-2.5"><span class="hr-num text-ink-gray-7">{{ row.last_out || '—' }}</span></td>
            <td class="px-3 py-2.5 text-sm text-ink-gray-7">{{ origin(row) }}</td>
            <td class="px-3 py-2.5"><StatusPill :kind="kind[row.status]">{{ word(row) }}</StatusPill></td>
          </tr>
        </tbody>
      </table>
    </div>
    <EmptyState v-if="sheet.data && !rows.length" :title="__('Nobody in this list.')" />
    <div v-if="!sheet.data && sheet.loading" aria-busy="true">
      <div v-for="i in 6" :key="i" class="h-12 animate-pulse border-t border-outline-gray-1 bg-surface-gray-2" />
    </div>
    <div v-if="sheet.data" class="bg-surface-gray-1 px-4 py-2.5 text-sm text-ink-gray-7">
      {{ __('Showing {0} of {1}. What needs someone is at the top: absent, then late.', [rows.length, sheet.data.counts.total]) }}
    </div>
  </section>
</template>

<script setup>
import { createResource } from 'frappe-ui'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import ErrorBox from '@/components/ErrorBox.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusPill from '@/components/StatusPill.vue'
import { boot } from '@/boot'
import { day, weekday } from '@/format'
import { __, count } from '@/i18n'

const route = useRoute()
const router = useRouter()

const ghost = 'flex h-9 min-w-9 items-center justify-center rounded-md border border-outline-gray-2 bg-surface-base px-3 text-sm text-ink-gray-8 disabled:opacity-50'
const solid = 'flex h-9 items-center rounded-md bg-surface-gray-10 px-4 text-sm font-semibold text-ink-base no-underline'

const date = ref(route.query.date || null)
const show = ref(route.query.show || 'all')

const sheet = createResource({
  url: 'zerone_hr.api.day.get_attendance',
  makeParams: () => ({ company: boot.company, date: date.value }),
  auto: true,
})
watch(date, () => sheet.reload())

const isToday = computed(() => !date.value || date.value === new Date().toISOString().slice(0, 10))
const title = computed(() => {
  const d = sheet.data?.date
  return d ? __('Attendance — {0} {1}', [weekday(d), day(d)]) : __('Attendance')
})

function shift(by) {
  const base = new Date(`${sheet.data?.date || new Date().toISOString().slice(0, 10)}T12:00:00`)
  base.setDate(base.getDate() + by)
  date.value = base.toISOString().slice(0, 10)
}

const groups = {
  all: () => true,
  in: (r) => r.status === 'present' || r.status === 'late',
  late: (r) => r.status === 'late',
  absent: (r) => r.status === 'absent',
  not_yet: (r) => r.status === 'not_yet',
  away: (r) => r.status === 'leave' || r.status === 'duty',
}

const tabs = computed(() => {
  const c = sheet.data?.counts || {}
  return [
    { key: 'all', label: __('All'), count: c.total ?? '' },
    { key: 'in', label: __('At work'), count: c.in_work ?? '' },
    { key: 'late', label: __('Late'), count: c.late ?? '' },
    { key: 'absent', label: __('Absent'), count: c.absent ?? '' },
    { key: 'not_yet', label: __('Not in yet'), count: c.not_yet ?? '' },
    { key: 'away', label: __('On leave or duty'), count: c.away ?? '' },
  ]
})

function setShow(key) {
  show.value = key
  router.replace({ query: { ...route.query, show: key === 'all' ? undefined : key } })
}

const rows = computed(() => (sheet.data?.rows || []).filter(groups[show.value] || groups.all))

const kind = { present: 'good', late: 'late', absent: 'refused', not_yet: 'neutral', leave: 'neutral', duty: 'waiting', off: 'neutral' }

function word(row) {
  return {
    present: __('Present'),
    late: __('Late'),
    absent: __('Absent'),
    not_yet: __('Not in yet'),
    leave: __('On leave'),
    duty: __('On duty'),
    off: __('Day off'),
  }[row.status]
}

function origin(row) {
  if (row.status === 'leave') return row.leave_until ? __('{0} until {1}', [__(row.leave_type || 'Leave'), day(row.leave_until)]) : __(row.leave_type || 'Leave')
  if (row.status === 'duty') return __('Approved duty request')
  return { mobile: __('Phone, with location'), device: __('Attendance device'), manual: __('Entered by HR') }[row.source] || __('No check-in yet')
}
</script>
