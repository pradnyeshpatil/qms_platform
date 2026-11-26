import { useQuery } from '@tanstack/react-query'
import { FileText, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/kit/button'
import { Card, PageTitle } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton } from '@/components/kit/feedback'
import { SelectInput, TextInput } from '@/components/kit/inputs'
import { Pager, Table, Td, Th } from '@/components/kit/table'
import { api, qs, tenantPath } from '@/lib/api'
import { shortDate } from '@/lib/format'
import type { Page } from '@/lib/types'
import { useCan } from '@/features/auth/auth'
import { useSlug } from '@/layout/AppLayout'
import { NewReportModal } from './NewReportModal'
import { ProgressBar, ReportStatus } from './StatusBadge'
import { EIGHT_D_STATUS, type EightDReport } from './types'

export function EightDListPage() {
  const slug = useSlug()
  const can = useCan()
  const [sp, setSp] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const status = sp.get('status') ?? ''
  const search = sp.get('search') ?? ''
  const page = Number(sp.get('page') ?? 1)
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }) }
  const q = useQuery({
    queryKey: [slug, 'eight-d-list', status, search, page],
    queryFn: () => api<Page<EightDReport>>(tenantPath(slug, `eight-d-reports/${qs({ status, search, page, ordering: '-created_at' })}`)),
    placeholderData: (prev) => prev,
  })
  return (
    <>
      <PageTitle title="8D reports" subtitle="Structured problem solving, from containment to closure."
        actions={can('eight_d_reports.create') ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New 8D report</Button> : undefined} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="min-w-56 flex-1"><TextInput aria-label="Search reports" icon={<Search className="h-4 w-4" />} placeholder="Search number, title, complaint or customer" defaultValue={search} onChange={(e) => set('search', e.target.value)} /></div>
          <div className="w-52"><SelectInput aria-label="Status" value={status} onChange={(e) => set('status', e.target.value)}><option value="">All statuses</option>{Object.entries(EIGHT_D_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}</SelectInput></div>
        </div>
        {q.isLoading ? <ListSkeleton rows={5} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : !q.data?.results.length ? (
          <EmptyPanel icon={<FileText className="h-6 w-6" />} title={search || status ? 'No reports match' : 'No 8D reports yet'} hint={search || status ? 'Try clearing the filters.' : 'Start one from a complaint when a formal investigation is needed.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <thead><tr><Th>Report</Th><Th>Complaint</Th><Th>Status</Th><Th>Progress</Th><Th>Leader</Th><Th>Target</Th></tr></thead>
                <tbody>
                  {q.data.results.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                      <Td><Link to={`/${slug}/eight-d/${r.id}`} className="block font-medium text-slate-900 hover:text-indigo-700"><span className="mr-2 font-mono text-xs text-slate-500">{r.number}</span>{r.title}</Link><span className="text-xs text-slate-500">{r.customer_name}{r.revision > 1 && ` · revision ${r.revision}`}</span></Td>
                      <Td><Link to={`/${slug}/complaints/${r.complaint}`} className="font-mono text-xs text-indigo-600 hover:underline">{r.complaint_number}</Link></Td>
                      <Td><ReportStatus status={r.status} /></Td>
                      <Td className="w-40"><ProgressBar percent={r.completion.percent} label={`${r.number} completion`} /><span className="text-xs text-slate-500">{r.completion.complete}/{r.completion.total} sections</span></Td>
                      <Td>{r.team_leader_name ?? '—'}</Td>
                      <Td>{r.target_close_date ? shortDate(r.target_close_date) : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="border-t border-slate-100"><Pager page={page} count={q.data.count} pageSize={20} noun="report" onPage={(p) => set('page', String(p))} /></div>
          </>
        )}
      </Card>
      <NewReportModal open={creating} onOpenChange={setCreating} />
    </>
  )
}
