import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Search, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/kit/button'
import { Card, PageTitle } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton } from '@/components/kit/feedback'
import { SelectInput, TextInput } from '@/components/kit/inputs'
import { Reveal } from '@/components/kit/motion'
import { SECTION_TONE } from '@/components/kit/theme'
import { ACTION_FILTERS, describeActivity, fieldLabel } from '@/lib/activity'
import { api, qs, tenantPath } from '@/lib/api'
import { dateTime, timeAgo } from '@/lib/format'
import type { AuditEntry, Page } from '@/lib/types'
import { cn } from '@/lib/utils'
import { RequirePermission } from '@/features/auth/auth'
import { KIND_STYLE } from '@/features/complaints/activityStyle'
import { useSlug } from '@/layout/AppLayout'

function Details({ e }: { e: AuditEntry }) {
  const entries = Object.entries(e.changes ?? {})
  const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
  return (
    <div className="grid gap-4 border-t border-slate-100 bg-slate-50/60 px-5 py-4 text-[13px] sm:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">What changed</p>
        {entries.length === 0 ? <p className="text-slate-500">No field details were recorded.</p> : (
          <dl className="space-y-1.5">
            {entries.map(([k, v]) => {
              const ch = v && typeof v === 'object' && ('from' in v || 'to' in v) ? (v as { from?: unknown; to?: unknown }) : null
              return <div key={k} className="flex gap-2"><dt className="w-32 shrink-0 text-slate-500">{fieldLabel(k)}</dt><dd className="min-w-0 break-words text-slate-800">{ch ? <><span className="text-slate-400 line-through">{show(ch.from)}</span> → <span className="font-medium">{show(ch.to)}</span></> : show(v)}</dd></div>
            })}
          </dl>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Technical details</p>
        <dl className="space-y-1.5 text-slate-600">
          <div className="flex gap-2"><dt className="w-32 shrink-0 text-slate-500">When</dt><dd>{dateTime(e.created_at)}</dd></div>
          <div className="flex gap-2"><dt className="w-32 shrink-0 text-slate-500">IP address</dt><dd>{e.ip_address ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="w-32 shrink-0 text-slate-500">Request ID</dt><dd className="break-all font-mono text-xs">{e.request_id || '—'}</dd></div>
          <div className="flex gap-2"><dt className="w-32 shrink-0 text-slate-500">Browser</dt><dd className="line-clamp-2 break-all text-xs">{e.user_agent || '—'}</dd></div>
        </dl>
      </div>
    </div>
  )
}

function Row({ e, slug, index }: { e: AuditEntry; slug: string; index: number }) {
  const [open, setOpen] = useState(false)
  const d = describeActivity(e, e.target_label || 'a complaint')
  const { icon: Icon, tone } = KIND_STYLE[d.kind]
  const link = e.target_type === 'complaint' && e.target_id && d.kind !== 'delete' ? `/${slug}/complaints/${e.target_id}` : null
  return (
    <Reveal as="li" index={index}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-white', tone)}><Icon className="h-4 w-4" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-700"><span className="font-semibold text-slate-900">{e.actor_name || 'System'}</span> {d.text}</span>
          {d.detail && <span className="block truncate text-xs text-slate-500">{d.detail}</span>}
        </span>
        <span className="hidden shrink-0 text-xs text-slate-400 sm:block" title={dateTime(e.created_at)}>{timeAgo(e.created_at)}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <Details e={e} />
            {link && <div className="border-t border-slate-100 px-5 py-2.5 text-[13px]"><Link to={link} className="font-medium text-indigo-600 hover:text-indigo-800">Open {e.target_label} →</Link></div>}
          </motion.div>
        )}
      </AnimatePresence>
    </Reveal>
  )
}

/** The data hooks live in the inner component so nothing is fetched unless the user may view the log. */
export function AuditLogPage() {
  return (
    <RequirePermission permission="audit.view">
      <AuditLogContent />
    </RequirePermission>
  )
}

function AuditLogContent() {
  const slug = useSlug()
  const [sp, setSp] = useSearchParams()
  const get = (k: string) => sp.get(k) ?? ''
  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k) }
    if (!('page' in patch)) n.delete('page')
    setSp(n, { replace: true })
  }
  const page = Number(get('page') || 1)
  const query = qs({ search: get('q'), action: get('action'), date_from: get('from'), date_to: get('to'), page: page > 1 ? page : '' })
  const q = useQuery({ queryKey: [slug, 'audit', query], queryFn: () => api<Page<AuditEntry>>(tenantPath(slug, `audit-log/${query || '?'}`)), placeholderData: (p) => p })
  const filtered = !!(get('q') || get('action') || get('from') || get('to'))
  const pages = Math.max(1, Math.ceil((q.data?.count ?? 0) / 20))

  return (
    <>
      <PageTitle icon={ScrollText} tone={SECTION_TONE.audit} title="Audit log" subtitle="A permanent, read-only record of who did what. Nobody can edit or delete it." />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="min-w-56 flex-1"><TextInput aria-label="Search the audit log" icon={<Search className="h-4 w-4" />} placeholder="Search by person, record or action…" value={get('q')} onChange={(e) => set({ q: e.target.value })} /></div>
          <div className="w-52"><SelectInput aria-label="Action" value={get('action')} onChange={(e) => set({ action: e.target.value })}><option value="">All actions</option>{ACTION_FILTERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</SelectInput></div>
          <label className="flex items-center gap-2 text-[13px] text-slate-500">From<TextInput type="date" className="w-40" value={get('from')} onChange={(e) => set({ from: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-[13px] text-slate-500">To<TextInput type="date" className="w-40" value={get('to')} onChange={(e) => set({ to: e.target.value })} /></label>
          {filtered && <Button variant="ghost" size="sm" onClick={() => setSp(new URLSearchParams(), { replace: true })}>Clear</Button>}
        </div>
        {q.isLoading ? <ListSkeleton rows={6} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : q.data!.results.length === 0 ? (
          <EmptyPanel icon={<ScrollText className="h-6 w-6" />} title={filtered ? 'Nothing matches those filters' : 'No activity recorded yet'} hint={filtered ? 'Try widening the dates or clearing the search.' : 'Actions like creating complaints or changing statuses will appear here.'} />
        ) : (
          <div className={cn('transition-opacity', q.isPlaceholderData && 'opacity-60')}>
            <ul className="divide-y divide-slate-100">{q.data!.results.map((e, i) => <Row key={e.id} e={e} slug={slug} index={i} />)}</ul>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[13px] text-slate-500">
              <span>{q.data!.count} entries{pages > 1 && ` · page ${page} of ${pages}`}</span>
              {pages > 1 && <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Next</Button></div>}
            </div>
          </div>
        )}
      </Card>
    </>
  )
}
