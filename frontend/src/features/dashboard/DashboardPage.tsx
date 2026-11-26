import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowUpRight, CalendarClock, ClipboardList, Flame, FolderOpen, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/kit/avatar'
import { buttonClass } from '@/components/kit/button'
import { Card, CardHeading, PageTitle } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, Skeleton } from '@/components/kit/feedback'
import { CountUp, Reveal } from '@/components/kit/motion'
import { SeverityPill } from '@/components/kit/pills'
import { Segmented } from '@/components/kit/segmented'
import { CATEGORY_STYLE, SEVERITY_STYLE } from '@/components/kit/theme'
import { api, qs, tenantPath } from '@/lib/api'
import { daysAgo, dueInfo, shortDate } from '@/lib/format'
import { SEVERITIES, type Bucket, type CardRow, type DashboardStats } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useCan } from '@/features/auth/auth'
import { useMembership } from '@/features/complaints/api'
import { useSlug } from '@/layout/AppLayout'

type Range = '7' | '30' | '90' | 'all'

function greeting(name: string) {
  const h = new Date().getHours()
  return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${name ? `, ${name}` : ''}`
}

function StatCard({ label, value, hint, icon: Icon, tone, to, index, pulse }: {
  label: string; value: number; hint: string; icon: React.ComponentType<{ className?: string }>; tone: string; to: string; index: number; pulse?: boolean
}) {
  return (
    <Reveal index={index}>
      <Link to={to} className="group relative block overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[var(--shadow-card)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60">
        <div className="flex items-start justify-between">
          <span className={cn('relative flex h-10 w-10 items-center justify-center rounded-xl', tone)}>
            {pulse && <span className="absolute inset-0 animate-[var(--animate-pulse-ring)] rounded-xl bg-rose-400/40" aria-hidden />}
            <Icon className="relative h-5 w-5" />
          </span>
          <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-indigo-500" aria-hidden />
        </div>
        <p className="mt-4 text-[13px] font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-4xl font-semibold tabular-nums tracking-tight text-slate-900"><CountUp value={value} /></p>
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      </Link>
    </Reveal>
  )
}

function BarList({ items, color, empty }: { items: Bucket[]; color: string; empty: string }) {
  if (!items.length) return <p className="px-5 pb-6 pt-3 text-sm text-slate-400">{empty}</p>
  const max = Math.max(...items.map((i) => i.count))
  return (
    <ul className="space-y-3 px-5 pb-5 pt-3">
      {items.map((it, i) => (
        <li key={it.id ?? it.name}>
          <div className="mb-1 flex items-center justify-between gap-3 text-[13px]"><span className="truncate text-slate-700">{it.name}</span><span className="font-medium tabular-nums text-slate-900">{it.count}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${(it.count / max) * 100}%` }} transition={{ duration: 0.8, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function StatusBreakdown({ data }: { data: DashboardStats['by_status'] }) {
  const total = data.reduce((n, s) => n + s.count, 0)
  const shown = data.filter((s) => s.count > 0)
  if (!total) return <p className="px-5 pb-6 pt-3 text-sm text-slate-400">Nothing to show for this period.</p>
  return (
    <div className="px-5 pb-5 pt-3">
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={shown.map((s) => `${s.name}: ${s.count}`).join(', ')}>
        {shown.map((s, i) => (
          <motion.div key={s.id} className="h-full first:rounded-l-full last:rounded-r-full" style={{ background: CATEGORY_STYLE[s.category].bar }} initial={{ flexGrow: 0 }} animate={{ flexGrow: s.count }} transition={{ duration: 0.8, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }} title={`${s.name}: ${s.count}`} />
        ))}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {shown.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2"><span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', CATEGORY_STYLE[s.category].dot)} /><span className="truncate text-slate-600">{s.name}</span></span>
            <span className="font-medium tabular-nums text-slate-900">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Donut({ stats }: { stats: DashboardStats }) {
  const total = SEVERITIES.reduce((n, s) => n + (stats.by_severity[s] ?? 0), 0)
  const segments = SEVERITIES.map((s) => ({ s, n: stats.by_severity[s] ?? 0 })).reduce<{ s: (typeof SEVERITIES)[number]; n: number; start: number }[]>(
    (acc, cur) => [...acc, { ...cur, start: acc.length ? acc[acc.length - 1].start + (acc[acc.length - 1].n / total) * 100 : 0 }], [],
  )
  return (
    <div className="flex flex-col items-center gap-5 px-5 pb-6 pt-3 sm:flex-row sm:justify-center">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 36 36" className="-rotate-90" role="img" aria-label={SEVERITIES.map((s) => `${SEVERITY_STYLE[s].label}: ${stats.by_severity[s] ?? 0}`).join(', ')}>
          <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#f1f5f9" strokeWidth="4" />
          {total > 0 && segments.map(({ s, n, start }, i) => {
            if (n === 0) return null
            const len = Math.max((n / total) * 100 - 1, 0.5)
            return (
              <motion.circle key={s} cx="18" cy="18" r="15.9155" fill="none" stroke={SEVERITY_STYLE[s].bar} strokeWidth="4" strokeDashoffset={-start}
                initial={{ strokeDasharray: '0 100' }} animate={{ strokeDasharray: `${len} ${100 - len}` }} transition={{ duration: 0.9, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }} />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-semibold tabular-nums text-slate-900"><CountUp value={total} /></span><span className="text-xs text-slate-400">total</span></div>
      </div>
      <ul className="space-y-2.5">
        {SEVERITIES.map((s) => (
          <li key={s} className="flex items-center gap-3 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY_STYLE[s].bar }} /><span className="w-16 text-slate-600">{SEVERITY_STYLE[s].label}</span><span className="font-semibold tabular-nums text-slate-900">{stats.by_severity[s] ?? 0}</span></li>
        ))}
      </ul>
    </div>
  )
}

function CardList({ rows, slug, empty, showDue }: { rows: CardRow[]; slug: string; empty: string; showDue?: boolean }) {
  if (!rows.length) return <p className="px-5 pb-6 pt-3 text-sm text-slate-400">{empty}</p>
  return (
    <ul className="divide-y divide-slate-100 px-2 pb-2 pt-1">
      {rows.map((r) => {
        const due = dueInfo(r.due_date, false)
        return (
          <li key={r.id}>
            <Link to={`/${slug}/complaints/${r.id}`} className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60">
              <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: SEVERITY_STYLE[r.severity].bar }} aria-hidden />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900 group-hover:text-indigo-700">{r.title}</span><span className="block truncate text-xs text-slate-500"><span className="font-mono">{r.number}</span> · {r.customer_name}</span></span>
              {showDue ? <span className={cn('shrink-0 text-xs font-medium', due.tone === 'soon' ? 'text-amber-600' : 'text-slate-500')}>{due.label}</span> : <SeverityPill severity={r.severity} className="hidden sm:inline-flex" />}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
    </div>
  )
}

export function DashboardPage() {
  const slug = useSlug()
  const can = useCan()
  const { me } = useMembership()
  const [range, setRange] = useState<Range>('all')
  const params = range === 'all' ? {} : { date_from: daysAgo(Number(range)) }
  const q = useQuery({ queryKey: [slug, 'dashboard', range], queryFn: () => api<DashboardStats>(tenantPath(slug, `dashboard/${qs(params)}`)), placeholderData: (p) => p })
  const base = `/${slug}/complaints`

  return (
    <>
      <PageTitle
        title={greeting(me?.first_name ?? '')}
        subtitle="Here’s what’s happening with your customer complaints."
        actions={<>
          <Segmented<Range> label="Time range" value={range} onChange={setRange} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All time' }]} />
          {can('complaints.create') && <Link to={`${base}?new=1`} className={buttonClass('primary', 'md')}><Plus className="h-4 w-4" /> New complaint</Link>}
        </>}
      />
      {q.isLoading ? <DashboardSkeleton /> : q.isError ? <Card><ErrorPanel error={q.error} onRetry={() => q.refetch()} /></Card> : q.data && (() => {
        const d = q.data
        if (d.total === 0 && range === 'all') {
          return <Card><EmptyPanel icon={<Sparkles className="h-6 w-6" />} title="Your dashboard is ready" hint="Log your first complaint and you’ll see status, severity and deadlines here at a glance." action={can('complaints.create') ? <Link to={`${base}?new=1`} className={buttonClass('primary')}><Plus className="h-4 w-4" /> Log a complaint</Link> : undefined} /></Card>
        }
        return (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard index={0} label="All complaints" value={d.total} hint="In the selected period" icon={ClipboardList} tone="bg-indigo-50 text-indigo-600" to={base} />
              <StatCard index={1} label="Open" value={d.open} hint="Not yet resolved or closed" icon={FolderOpen} tone="bg-sky-50 text-sky-600" to={`${base}?view=open`} />
              <StatCard index={2} label="Overdue" value={d.overdue} hint={d.overdue ? 'Past their due date' : 'Nothing is late. Nice!'} icon={AlertTriangle} tone={d.overdue ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'} to={`${base}?view=overdue`} pulse={d.overdue > 0} />
              <StatCard index={3} label="Critical" value={d.by_severity.critical ?? 0} hint="Safety or line-stopping issues" icon={Flame} tone="bg-amber-50 text-amber-600" to={`${base}?severity=critical`} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Reveal index={4}><Card className="h-full"><CardHeading title="Where complaints are" hint="By workflow status" /><StatusBreakdown data={d.by_status} /></Card></Reveal>
              <Reveal index={5}><Card className="h-full"><CardHeading title="How serious they are" hint="By severity" /><Donut stats={d} /></Card></Reveal>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Reveal index={6}><Card className="h-full"><CardHeading title="Coming up" hint="Open complaints due in the next 14 days" action={<CalendarClock className="h-5 w-5 text-slate-300" />} /><CardList rows={d.upcoming_deadlines} slug={slug} showDue empty="No deadlines in the next two weeks." /></Card></Reveal>
              <Reveal index={7}><Card className="h-full"><CardHeading title="Recently logged" action={<Link to={base} className="text-[13px] font-medium text-indigo-600 hover:text-indigo-800">View all</Link>} /><CardList rows={d.recent} slug={slug} empty="No complaints in this period." /></Card></Reveal>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Reveal index={8}><Card className="h-full"><CardHeading title="Top customers" /><BarList items={d.by_customer} color="linear-gradient(90deg,#6366f1,#8b5cf6)" empty="No data yet." /></Card></Reveal>
              <Reveal index={9}><Card className="h-full"><CardHeading title="By department" /><BarList items={d.by_department} color="linear-gradient(90deg,#0ea5e9,#6366f1)" empty="No data yet." /></Card></Reveal>
              <Reveal index={10}><Card className="h-full"><CardHeading title="Who’s handling them" />
                {d.by_employee.length ? <ul className="space-y-3 px-5 pb-5 pt-3">{d.by_employee.map((e) => <li key={e.id} className="flex items-center gap-3"><Avatar name={e.name} size="sm" /><span className="min-w-0 flex-1 truncate text-sm text-slate-700">{e.name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">{e.count}</span></li>)}</ul> : <p className="px-5 pb-6 pt-3 text-sm text-slate-400">No owners assigned yet.</p>}
              </Card></Reveal>
            </div>
            <p className="text-center text-xs text-slate-400">Updated {shortDate(new Date().toISOString())}. Counts follow the records you’re allowed to see.</p>
          </div>
        )
      })()}
    </>
  )
}
