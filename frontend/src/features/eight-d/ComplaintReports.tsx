import { useQuery } from '@tanstack/react-query'
import { FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/kit/button'
import { Card } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton } from '@/components/kit/feedback'
import { api, qs, tenantPath } from '@/lib/api'
import type { Page } from '@/lib/types'
import { useCan } from '@/features/auth/auth'
import { useSlug } from '@/layout/AppLayout'
import { NewReportModal } from './NewReportModal'
import { ProgressBar, ReportStatus } from './StatusBadge'
import type { EightDReport } from './types'

/** The 8D reports of one complaint (a complaint may have none, one or several). */
export function ComplaintReports({ complaintId }: { complaintId: string }) {
  const slug = useSlug()
  const can = useCan()
  const [creating, setCreating] = useState(false)
  const q = useQuery({
    queryKey: [slug, 'eight-d-list', 'complaint', complaintId],
    queryFn: () => api<Page<EightDReport>>(tenantPath(slug, `eight-d-reports/${qs({ complaint: complaintId, page_size: 50 })}`)),
    enabled: can('eight_d_reports.view'),
  })
  if (!can('eight_d_reports.view')) return <Card><EmptyPanel title="No access" hint="You don’t have permission to view 8D reports." /></Card>
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-900">8D reports</h2>
        {can('eight_d_reports.create') && <Button size="sm" variant="soft" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" /> Start 8D report</Button>}
      </div>
      {q.isLoading ? <ListSkeleton rows={2} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : !q.data?.results.length ? (
        <EmptyPanel icon={<FileText className="h-6 w-6" />} title="No 8D report for this complaint" hint="Not every complaint needs one. Start a report when a formal investigation is required." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {q.data.results.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <Link to={`/${slug}/eight-d/${r.id}`} className="min-w-0 flex-1 hover:text-indigo-700"><span className="mr-2 font-mono text-xs text-slate-500">{r.number}</span><span className="text-sm font-medium text-slate-900">{r.title}</span></Link>
              <div className="w-32"><ProgressBar percent={r.completion.percent} label={`${r.number} completion`} /></div>
              <ReportStatus status={r.status} />
            </li>
          ))}
        </ul>
      )}
      <NewReportModal open={creating} onOpenChange={setCreating} complaintId={complaintId} />
    </Card>
  )
}
