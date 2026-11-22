import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Select } from '@/components/ui/form-controls'
import { Badge, Card, CardContent, CardHeader, ErrorState, Loading } from '@/components/ui/misc'
import { api, ApiError, tenantPath } from '@/lib/api'
import { STATUSES, STATUS_LABEL, type Complaint, type ComplaintStatus } from '@/lib/types'
import { PageHeader, useSlug } from '@/layout/AppLayout'
import { SeverityBadge, StatusBadge } from './shared'

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children || '—'}</dd>
    </div>
  )
}

export function ComplaintDetailPage() {
  const slug = useSlug()
  const { id } = useParams()
  const qc = useQueryClient()
  const key = [slug, 'complaint', id]
  const q = useQuery({ queryKey: key, queryFn: () => api<Complaint>(tenantPath(slug, `complaints/${id}/`)) })
  const setStatus = useMutation({
    mutationFn: (status: ComplaintStatus) => api<Complaint>(tenantPath(slug, `complaints/${id}/`), { method: 'PATCH', body: { status } }),
    onSuccess: (c) => {
      qc.setQueryData(key, c)
      qc.invalidateQueries({ queryKey: [slug, 'complaints'] })
      qc.invalidateQueries({ queryKey: [slug, 'dashboard'] })
    },
  })

  if (q.isLoading) return <Loading />
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return <ErrorState error={notFound ? new Error('Complaint not found.') : q.error} onRetry={notFound ? undefined : q.refetch} />
  }
  const c = q.data!
  return (
    <>
      <Link to={`/${slug}/complaints`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to complaints
      </Link>
      <PageHeader title={`${c.number} · ${c.title}`} actions={c.is_overdue ? <Badge tone="red">overdue</Badge> : undefined} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>Details</CardHeader>
          <CardContent className="space-y-6">
            <p className="whitespace-pre-wrap text-sm">{c.description || 'No description.'}</p>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Customer">{c.customer_name}</Item>
              <Item label="Owner">{c.owner_name}</Item>
              <Item label="Product">{c.product_name}</Item>
              <Item label="Part number">{c.part_number}</Item>
              <Item label="Due date">{c.due_date}</Item>
              <Item label="Created">{new Date(c.created_at).toLocaleString()}</Item>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>Status</CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2"><StatusBadge s={c.status} /> <SeverityBadge s={c.severity} /></div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="status">Change status</label>
              <Select id="status" value={c.status} disabled={setStatus.isPending} onChange={(e) => setStatus.mutate(e.target.value as ComplaintStatus)}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </Select>
              {setStatus.isError && <p role="alert" className="text-xs text-destructive">{setStatus.error.message}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
