<template>
  <PageHeader :trail="__('Human Resources')" :title="greeting">
    <span v-if="data">{{ weekday(data.date) }} <span class="hr-num">{{ day(data.date) }}</span> · {{ data.company }}</span>
  </PageHeader>

  <ErrorBox v-if="today.error" :message="today.error.messages?.join(' ') || today.error.message" @retry="today.reload()" />

  <template v-else-if="data">
    <section :aria-label="__('Attendance now')" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        :label="__('At work now')"
        :figure="data.counts.in_work"
        :of="__('of {0}', [data.counts.total])"
        :to="{ name: 'Attendance' }"
      />
      <StatCard
        :label="__('Late today')"
        :figure="data.counts.late"
        :note="data.counts.late ? count(data.counts.longest_late, 'Longest {0} minutes') : ''"
        tone="late"
        :to="{ name: 'Attendance', query: { show: 'late' } }"
      />
      <StatCard
        :label="__('Not checked in')"
        :figure="data.counts.absent"
        :note="data.counts.not_yet ? count(data.counts.not_yet, '{0} still within the shift') : ''"
        :to="{ name: 'Attendance', query: { show: 'absent' } }"
      />
      <StatCard
        :label="__('On leave or duty')"
        :figure="data.counts.away"
        :note="__('{0} on leave, {1} on duty', [data.counts.leave, data.counts.duty])"
        :to="{ name: 'Attendance', query: { show: 'away' } }"
      />
    </section>

    <div class="flex flex-wrap items-start gap-4">
      <div class="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        <Card :title="__('Waiting for your decision')">
          <template #aside>
            <span class="text-sm text-ink-gray-7">{{ count(data.decisions.count, '{0} requests') }}</span>
          </template>
          <EmptyState
            v-if="!data.decisions.items.length"
            :title="__('Nothing is waiting.')"
            :hint="__('Leave, attendance corrections, advances and expense claims appear here when employees send them.')"
          />
          <a
            v-for="item in data.decisions.items"
            :key="item.doctype + item.name"
            :href="deskUrl(item.doctype, item.name)"
            class="flex items-center gap-3 border-t border-outline-gray-1 px-5 py-3 text-ink-gray-9 no-underline hover:bg-surface-gray-2"
          >
            <span
              aria-hidden="true"
              class="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-gray-3 font-bold"
              >{{ initials(item.employee_name) }}</span
            >
            <span class="min-w-0 flex-1">
              <span class="block"><b class="font-semibold">{{ item.employee_name }}</b> · {{ describe(item) }}</span>
              <span class="block text-sm text-ink-gray-7">{{ detail(item) }}</span>
            </span>
            <span class="text-sm text-ink-blue-link">{{ __('Review') }}</span>
          </a>
        </Card>

        <Card :title="__('Payroll this month')">
          <div class="px-5 pb-4">
            <template v-if="data.payroll">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="text-sm text-ink-gray-7">
                  <span class="hr-num">{{ day(data.payroll.start_date) }}</span> –
                  <span class="hr-num">{{ day(data.payroll.end_date) }}</span> ·
                  {{ count(data.payroll.employees || 0, '{0} employees') }}
                </div>
                <StatusPill :kind="payrollKind">{{ payrollWord }}</StatusPill>
              </div>
              <div v-if="data.payroll.slips_created" class="mt-3 flex flex-wrap gap-7">
                <div>
                  <div class="text-sm text-ink-gray-7">{{ __('Net pay') }}</div>
                  <div class="text-lg font-semibold"><MoneyAmount :value="data.payroll.net" /></div>
                </div>
                <div>
                  <div class="text-sm text-ink-gray-7">{{ __('Deductions') }}</div>
                  <div class="text-lg font-semibold"><MoneyAmount :value="data.payroll.deductions" /></div>
                </div>
              </div>
              <a :href="deskUrl('Payroll Entry', data.payroll.name)" class="mt-3 inline-block text-sm text-ink-blue-link">{{ __('Open the payroll entry') }}</a>
            </template>
            <EmptyState v-else :title="__('No payroll for this month yet.')" :hint="__('Start it when the attendance sheet is ready.')">
              <a href="/app/payroll-entry/new" class="text-sm text-ink-blue-link">{{ __('New payroll entry') }}</a>
            </EmptyState>
          </div>
        </Card>
      </div>

      <aside class="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
        <Card :title="__('Needs a call now')">
          <EmptyState v-if="!data.needs_attention.length" :title="__('Everyone is accounted for.')" />
          <div
            v-for="row in data.needs_attention"
            :key="row.employee"
            class="flex items-center justify-between gap-2 border-t border-outline-gray-1 px-5 py-2.5"
          >
            <span class="min-w-0">
              <b class="font-semibold">{{ row.employee_name }}</b>
              <span class="block text-sm text-ink-gray-7">
                {{ row.shift || __('No shift') }}<template v-if="row.shift_start"> · <span class="hr-num">{{ row.shift_start }}</span></template>
              </span>
            </span>
            <StatusPill v-if="row.status === 'absent'" kind="refused">{{ __('Absent') }}</StatusPill>
            <StatusPill v-else kind="late">{{ count(row.late_minutes, '{0} min late') }}</StatusPill>
          </div>
        </Card>

        <Card :title="__('Documents expiring soon')">
          <EmptyState v-if="!data.expiring.length" :title="__('Nothing expires in the next 45 days.')" />
          <a
            v-for="doc in data.expiring"
            :key="doc.employee + doc.document"
            :href="deskUrl('Employee', doc.employee)"
            class="flex justify-between gap-2 border-t border-outline-gray-1 px-5 py-2.5 text-ink-gray-9 no-underline hover:bg-surface-gray-2"
          >
            <span>{{ __(doc.document) }} · {{ doc.employee_name }}</span>
            <span class="whitespace-nowrap" :class="doc.urgent ? 'font-semibold text-ink-amber-7' : 'text-ink-gray-7'">{{
              left(doc.days_left)
            }}</span>
          </a>
        </Card>
      </aside>
    </div>
  </template>

  <div v-else class="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
    <div v-for="i in 4" :key="i" class="h-[104px] animate-pulse rounded-lg bg-surface-gray-4" />
  </div>
</template>

<script setup>
import { createResource } from 'frappe-ui'
import { computed } from 'vue'

import Card from '@/components/Card.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorBox from '@/components/ErrorBox.vue'
import MoneyAmount from '@/components/MoneyAmount.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusPill from '@/components/StatusPill.vue'
import { boot } from '@/boot'
import { day, initials, money, weekday } from '@/format'
import { __, count } from '@/i18n'

const today = createResource({
  url: 'bunood_hr.api.day.get_today',
  params: { company: boot.company },
  auto: true,
})
const data = computed(() => today.data)

const greeting = computed(() => {
  const first = (boot.fullName || '').split(' ')[0]
  const hour = new Date().getHours()
  const text = hour < 12 ? 'Good morning, {0}' : 'Good evening, {0}'
  return __(text, [first])
})

function deskUrl(doctype, name) {
  return `/app/${doctype.toLowerCase().replace(/ /g, '-')}/${encodeURIComponent(name)}`
}

function describe(item) {
  return {
    'Leave Application': __(item.leave_type || 'Leave'),
    'Attendance Request': item.reason === 'On Duty' ? __('Duty outside the office') : __('Attendance correction'),
    'Employee Advance': __('Advance'),
    'Expense Claim': __('Expense claim'),
  }[item.doctype]
}

function detail(item) {
  if (item.doctype === 'Leave Application' || item.doctype === 'Attendance Request') {
    const days = item.total_leave_days ? count(item.total_leave_days, '{0} days') + ' · ' : ''
    return days + __('{0} to {1}', [day(item.from_date), day(item.to_date)])
  }
  if (item.doctype === 'Employee Advance') return money(item.advance_amount) + ' · ' + (item.purpose || '')
  return money(item.total_claimed_amount)
}

function left(days) {
  if (days < 0) return __('Expired')
  if (days === 0) return __('Today')
  return count(days, 'in {0} days')
}

const payrollWord = computed(() => {
  const p = data.value?.payroll
  if (!p) return ''
  if (p.slips_submitted) return __('Paid')
  if (p.slips_created) return __('In review')
  return __('Draft')
})
const payrollKind = computed(() => {
  const p = data.value?.payroll
  if (p?.slips_submitted) return 'done'
  if (p?.slips_created) return 'waiting'
  return 'neutral'
})
</script>
