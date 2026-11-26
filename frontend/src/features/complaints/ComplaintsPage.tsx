import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { ClipboardList, Download, FileSpreadsheet, FileText, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar } from '@/components/kit/avatar'
import { Button } from '@/components/kit/button'
import { Card, PageTitle } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton } from '@/components/kit/feedback'
import { SelectInput, TextInput } from '@/components/kit/inputs'
import { Menu, MenuLabel, MenuLink } from '@/components/kit/menu'
import { Reveal } from '@/components/kit/motion'
import { SeverityPill, StatusPill } from '@/components/kit/pills'
import { Segmented } from '@/components/kit/segmented'
import { SECTION_TONE, SEVERITY_STYLE } from '@/components/kit/theme'
import { api, qs, tenantPath } from '@/lib/api'
import { SEVERITIES, type Complaint, type Customer, type Page } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useCan } from '@/features/auth/auth'
import { useSlug } from '@/layout/AppLayout'
import { useDefectCategories, useStatuses } from './api'
import { ComplaintFormDrawer } from './ComplaintForm'
import { DueLabel } from './parts'

type View = 'all' | 'open' | 'overdue' | 'mine'
const SORTS = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
  { value: 'due_date', label: 'Due soonest' },
  { value: 'severity', label: 'Most severe first' },
]
const FILTER_KEYS = ['status', 'severity', 'customer', 'defect_category', 'reported_from', 'reported_to'] as const

function Pager({ page, count, pageSize, onPage }: { page: number; count: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  if (pages <= 1) return <div className="px-5 py-3 text-[13px] text-slate-500">{count} {count === 1 ? 'complaint' : 'complaints'}</div>
  return (
    <div className="flex items-center justify-between px-5 py-3 text-[13px] text-slate-500">
      <span>Page {page} of {pages} · {count} complaints</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  )
}

function Row({ c, slug, index }: { c: Complaint; slug: string; index: number }) {
  return (
    <Reveal as="li" index={index}>
      <Link
        to={`/${slug}/complaints/${c.id}`}
        className="group relative grid items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-indigo-50/40 focus-visible:bg-indigo-50/60 focus-visible:outline-none md:grid-cols-[minmax(0,1fr)_88px_168px_140px_36px]"
      >
        <span className={cn('absolute inset-y-3 left-0 w-[3px] rounded-r-full opacity-0 transition-opacity group-hover:opacity-100', 'bg-indigo-500')} style={{ backgroundColor: SEVERITY_STYLE[c.severity].bar }} aria-hidden />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-slate-400">{c.number}</span>
            {c.is_overdue && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600">Overdue</span>}
          </div>
          <p className="truncate text-[15px] font-medium text-slate-900 group-hover:text-indigo-700">{c.title}</p>
          <p className="truncate text-[13px] text-slate-500">{c.customer_name}{c.part_number && <> · {c.part_number}</>}{c.defect_category_name && <> · {c.defect_category_name}</>}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 md:contents">
          <SeverityPill severity={c.severity} className="md:justify-self-start" />
          <StatusPill name={c.status_name} category={c.status_category} className="md:justify-self-start" />
          <DueLabel complaint={c} className="ml-auto md:ml-0 md:justify-self-start" />
        </div>
        <div className="hidden justify-self-end md:block">{c.owner_name ? <Avatar name={c.owner_name} size="md" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-slate-300 text-[10px] text-slate-400" title="Unassigned">—</span>}</div>
      </Link>
    </Reveal>
  )
}

export function ComplaintsPage() {
  const slug = useSlug()
  const can = useCan()
  const [sp, setSp] = useSearchParams()
  const [creating, setCreating] = useState(sp.get('new') === '1')
  const [showFilters, setShowFilters] = useState(() => FILTER_KEYS.some((k) => sp.get(k)))
  const statuses = useStatuses()
  const defects = useDefectCategories()
  const customers = useQuery({
    queryKey: [slug, 'customers', 'options'], enabled: can('customers.view'),
    queryFn: () => api<Page<Customer>>(tenantPath(slug, 'customers/?page_size=100')),
  })

  const get = (k: string) => sp.get(k) ?? ''
  const view = (get('view') || 'all') as View
  const page = Number(get('page') || 1)
  const ordering = get('ordering') || '-created_at'
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k) }
    if (!('page' in patch)) next.delete('page')
    setSp(next, { replace: true })
  }
  const activeFilters = FILTER_KEYS.filter((k) => get(k)).length
  const filters = {
    search: get('q'), status: get('status'), severity: get('severity'), customer: get('customer'),
    defect_category: get('defect_category'), reported_from: get('reported_from'), reported_to: get('reported_to'),
    open: view === 'open', overdue: view === 'overdue', mine: view === 'mine', ordering,
  }
  const query = qs({ ...filters, page: page > 1 ? page : '' })
  const q = useQuery({
    queryKey: [slug, 'complaints', query],
    queryFn: () => api<Page<Complaint>>(tenantPath(slug, `complaints/${query || '?'}`)),
    placeholderData: (prev) => prev,
  })
  const exportUrl = (fmt: 'csv' | 'xlsx') => tenantPath(slug, `complaints/export/${qs({ ...filters, export_format: fmt })}`)
  const anyFilter = !!(get('q') || activeFilters || view !== 'all')
  const clearAll = () => setSp(new URLSearchParams(), { replace: true })
  const count = q.data?.count ?? 0

  return (
    <>
      <PageTitle
        icon={ClipboardList} tone={SECTION_TONE.complaints}
        title="Complaints"
        subtitle={q.data ? `${count} ${anyFilter ? 'matching' : 'in total'}` : 'Every customer complaint in one place'}
        actions={<>
          <Menu trigger={<Button variant="secondary"><Download className="h-4 w-4" /> Export</Button>}>
            <MenuLabel>Current list{anyFilter ? ' (with filters)' : ''}</MenuLabel>
            <MenuLink href={exportUrl('csv')} download icon={<FileText className="h-4 w-4" />}>CSV file</MenuLink>
            <MenuLink href={exportUrl('xlsx')} download icon={<FileSpreadsheet className="h-4 w-4" />}>Excel file</MenuLink>
          </Menu>
          {can('complaints.create') && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New complaint</Button>}
        </>}
      />

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<View> label="Show" value={view} onChange={(v) => set({ view: v === 'all' ? '' : v })} options={[
              { value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'overdue', label: 'Overdue' }, { value: 'mine', label: 'Mine' },
            ]} />
            <div className="min-w-56 flex-1">
              <TextInput aria-label="Search complaints" icon={<Search className="h-4 w-4" />} placeholder="Search number, title, part, batch, customer…" value={get('q')} onChange={(e) => set({ q: e.target.value })} />
            </div>
            <Button variant={showFilters || activeFilters ? 'soft' : 'secondary'} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
              <SlidersHorizontal className="h-4 w-4" /> Filters
              {activeFilters > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-[11px] text-white">{activeFilters}</span>}
            </Button>
            <div className="w-40"><SelectInput aria-label="Sort by" value={ordering} onChange={(e) => set({ ordering: e.target.value === '-created_at' ? '' : e.target.value })}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </SelectInput></div>
          </div>
          <AnimatePresence initial={false}>
            {showFilters && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
                  <SelectInput aria-label="Status" value={get('status')} onChange={(e) => set({ status: e.target.value })}>
                    <option value="">Any status</option>
                    {statuses.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </SelectInput>
                  <SelectInput aria-label="Severity" value={get('severity')} onChange={(e) => set({ severity: e.target.value })}>
                    <option value="">Any severity</option>
                    {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_STYLE[s].label}</option>)}
                  </SelectInput>
                  <SelectInput aria-label="Defect category" value={get('defect_category')} onChange={(e) => set({ defect_category: e.target.value })}>
                    <option value="">Any defect type</option>
                    {defects.data?.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </SelectInput>
                  {can('customers.view') && (
                    <SelectInput aria-label="Customer" value={get('customer')} onChange={(e) => set({ customer: e.target.value })}>
                      <option value="">Any customer</option>
                      {customers.data?.results.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </SelectInput>
                  )}
                  <label className="flex items-center gap-2 text-[13px] text-slate-500"><span className="w-24 shrink-0">Reported from</span><TextInput type="date" value={get('reported_from')} onChange={(e) => set({ reported_from: e.target.value })} /></label>
                  <label className="flex items-center gap-2 text-[13px] text-slate-500"><span className="w-24 shrink-0">Reported to</span><TextInput type="date" value={get('reported_to')} onChange={(e) => set({ reported_to: e.target.value })} /></label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {anyFilter && <button type="button" onClick={clearAll} className="inline-flex items-center gap-1 text-[13px] font-medium text-indigo-600 hover:text-indigo-800"><X className="h-3.5 w-3.5" /> Clear all filters</button>}
        </div>

        {q.isLoading ? <ListSkeleton rows={6} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : q.data!.results.length === 0 ? (
          anyFilter ? (
            <EmptyPanel title="No complaints match" hint="Try removing a filter or searching for something else." action={<Button variant="secondary" onClick={clearAll}>Clear filters</Button>} />
          ) : (
            <EmptyPanel icon={<ClipboardList className="h-6 w-6" />} title="No complaints yet" hint="When a customer reports a problem, log it here and track it all the way to closure."
              action={can('complaints.create') ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Log the first complaint</Button> : undefined} />
          )
        ) : (
          <div className={cn('transition-opacity', q.isPlaceholderData && 'opacity-60')}>
            <ul className="divide-y divide-slate-100">{q.data!.results.map((c, i) => <Row key={c.id} c={c} slug={slug} index={i} />)}</ul>
            <div className="border-t border-slate-100"><Pager page={page} count={count} pageSize={20} onPage={(p) => set({ page: String(p) })} /></div>
          </div>
        )}
      </Card>

      <ComplaintFormDrawer open={creating} onOpenChange={(o) => {
        setCreating(o)
        if (!o && sp.get('new')) { const n = new URLSearchParams(sp); n.delete('new'); setSp(n, { replace: true }) }
      }} />
    </>
  )
}
