import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/kit/button'
import { Card } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton } from '@/components/kit/feedback'
import { Modal } from '@/components/kit/overlay'
import { Chip } from '@/components/kit/pills'
import { api, tenantPath } from '@/lib/api'
import { dateTime } from '@/lib/format'
import { useSlug } from '@/layout/AppLayout'
import type { EightDDetail, Revision } from './types'

function SnapshotModal({ report, rev, onClose }: { report: EightDDetail; rev: Revision; onClose: () => void }) {
  const slug = useSlug()
  const q = useQuery({ queryKey: [slug, 'eight-d-rev', rev.id], queryFn: () => api<{ snapshot: Record<string, unknown> }>(tenantPath(slug, `eight-d-reports/${report.id}/revisions/${rev.id}/`)) })
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`Revision ${rev.revision} · ${rev.kind}`} description={`Frozen ${dateTime(rev.created_at)}. This is exactly what the PDF is rendered from.`}>
      {q.isError ? <ErrorPanel error={q.error} /> : !q.data ? <ListSkeleton rows={3} /> : (
        <pre className="scroll-thin max-h-[55vh] overflow-auto rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 ring-1 ring-slate-200/70">{JSON.stringify(q.data.snapshot, null, 2)}</pre>
      )}
    </Modal>
  )
}

export function RevisionsPanel({ report }: { report: EightDDetail }) {
  const slug = useSlug()
  const q = useQuery({ queryKey: [slug, 'eight-d', report.id, 'revisions', report.status, report.revision], queryFn: () => api<Revision[]>(tenantPath(slug, `eight-d-reports/${report.id}/revisions/`)) })
  const [open, setOpen] = useState<Revision | null>(null)
  return (
    <Card className="p-5">
      {q.isLoading ? <ListSkeleton rows={2} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyPanel icon={<History className="h-6 w-6" />} title="No snapshots yet" hint="A locked snapshot is saved when the report is approved and again when it is sent to the customer." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {q.data.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-2"><span className="font-semibold text-slate-900">Revision {r.revision}</span><Chip tone={r.kind === 'approved' ? 'emerald' : 'indigo'}>{r.kind}</Chip><span className="text-sm text-slate-500">{dateTime(r.created_at)}</span></div>
              <Button size="sm" variant="secondary" onClick={() => setOpen(r)}>View</Button>
            </li>
          ))}
        </ul>
      )}
      {open && <SnapshotModal report={report} rev={open} onClose={() => setOpen(null)} />}
    </Card>
  )
}
