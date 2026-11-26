import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Activity, ClipboardList, MessageSquare, MoreHorizontal, Paperclip, Pencil, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Avatar } from '@/components/kit/avatar'
import { Button } from '@/components/kit/button'
import { Card, CardHeading } from '@/components/kit/card'
import { ErrorPanel, Notice, Skeleton } from '@/components/kit/feedback'
import { Menu, MenuItem, MenuSeparator } from '@/components/kit/menu'
import { ConfirmDialog } from '@/components/kit/overlay'
import { SeverityPill, StatusPill } from '@/components/kit/pills'
import { TabBar } from '@/components/kit/segmented'
import { api, ApiError, tenantPath } from '@/lib/api'
import { dateTime, shortDate } from '@/lib/format'
import { SOURCE_LABEL, type Attachment, type Comment, type Page } from '@/lib/types'
import { useCan } from '@/features/auth/auth'
import { useSlug } from '@/layout/AppLayout'
import { targetQuery, useComplaint, useRefreshComplaint, useStatuses } from './api'
import { ActivityPanel } from './ActivityPanel'
import { AssignModal } from './AssignModal'
import { ChangeStatusModal } from './ChangeStatusModal'
import { CommentsPanel } from './CommentsPanel'
import { ComplaintFormDrawer } from './ComplaintForm'
import { FilesPanel } from './FilesPanel'
import { DueLabel, Fact } from './parts'
import { StatusStepper } from './StatusStepper'

type Tab = 'overview' | 'comments' | 'files' | 'activity'

function DetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading complaint">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]"><Skeleton className="h-80 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
    </div>
  )
}

export function ComplaintDetailPage() {
  const slug = useSlug()
  const nav = useNavigate()
  const can = useCan()
  const { id } = useParams()
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) || 'overview'
  const q = useComplaint(id)
  const statuses = useStatuses()
  const refresh = useRefreshComplaint()
  const [editing, setEditing] = useState(false)
  const [changing, setChanging] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Counts for the tab badges (cheap: page_size=1 returns just `count`).
  const counts = useQuery({
    queryKey: [slug, 'counts', id], enabled: !!id,
    queryFn: async () => {
      const [c, f] = await Promise.all([
        api<Page<Comment>>(tenantPath(slug, `comments/${targetQuery(id!, { page_size: 1 })}`)).catch(() => null),
        api<Page<Attachment>>(tenantPath(slug, `attachments/${targetQuery(id!, { page_size: 1 })}`)).catch(() => null),
      ])
      return { comments: c?.count ?? 0, files: f?.count ?? 0 }
    },
  })
  const del = useMutation({
    mutationFn: () => api(tenantPath(slug, `complaints/${id}/`), { method: 'DELETE' }),
    onSuccess: () => { refresh(); toast.success('Complaint deleted'); nav(`/${slug}/complaints`) },
    onError: (e: Error) => { setDeleting(false); toast.error(e.message) },
  })

  if (q.isLoading) return <DetailSkeleton />
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return (
      <Card><ErrorPanel error={notFound ? new Error('We couldn’t find that complaint. It may have been deleted, or you may not have access to it.') : q.error} onRetry={notFound ? undefined : () => q.refetch()} />
        <div className="pb-8 text-center"><Link className="text-sm font-medium text-indigo-600" to={`/${slug}/complaints`}>Back to complaints</Link></div></Card>
    )
  }
  const c = q.data!
  const finished = c.status_category === 'resolved' || c.status_category === 'closed'
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); if (t === 'overview') n.delete('tab'); else n.set('tab', t)
    setSp(n, { replace: true }) }
  const canEdit = can('complaints.update')

  return (
    <>
      <Link to={`/${slug}/complaints`} className="mb-4 inline-flex items-center gap-1.5 rounded-lg text-sm text-slate-500 transition-colors hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> All complaints</Link>

      <Card className="mb-6 overflow-hidden">
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{c.number}</span>
                <SeverityPill severity={c.severity} />
                {c.is_overdue && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-600/20">Overdue</span>}
              </div>
              <h1 className="text-2xl font-semibold leading-snug tracking-tight text-slate-900">{c.title}</h1>
              <p className="mt-1 text-sm text-slate-500">{c.customer_name} · reported {shortDate(c.reported_date ?? c.created_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button" onClick={() => setChanging(true)} disabled={!canEdit}
                className="group flex items-center gap-2 rounded-xl bg-slate-50 py-1.5 pl-2 pr-3 ring-1 ring-slate-200 transition hover:bg-white hover:ring-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 disabled:cursor-default disabled:hover:bg-slate-50 disabled:hover:ring-slate-200"
                aria-label={`Status: ${c.status_name}. ${canEdit ? 'Change status' : ''}`}
              >
                <StatusPill name={c.status_name} category={c.status_category} />
                {canEdit && <span className="text-xs font-medium text-indigo-600 group-hover:underline">Change</span>}
              </button>
              {(canEdit || can('complaints.delete')) && (
                <Menu trigger={<Button variant="secondary" size="icon" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>}>
                  {canEdit && <MenuItem icon={<Pencil className="h-4 w-4" />} onSelect={() => setEditing(true)}>Edit details</MenuItem>}
                  {can('complaints.assign') && <MenuItem icon={<UserPlus className="h-4 w-4" />} onSelect={() => setAssigning(true)}>Assign people</MenuItem>}
                  {can('complaints.delete') && <><MenuSeparator /><MenuItem danger icon={<Trash2 className="h-4 w-4" />} onSelect={() => setDeleting(true)}>Delete complaint</MenuItem></>}
                </Menu>
              )}
            </div>
          </div>
        </div>
        {statuses.data && <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-5"><StatusStepper statuses={statuses.data} currentId={c.status} /></div>}
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <TabBar<Tab> value={tab} onChange={setTab} tabs={[
            { value: 'overview', label: 'Overview', icon: <ClipboardList className="h-4 w-4" /> },
            { value: 'comments', label: 'Comments', icon: <MessageSquare className="h-4 w-4" />, count: counts.data?.comments },
            { value: 'files', label: 'Files', icon: <Paperclip className="h-4 w-4" />, count: counts.data?.files },
            { value: 'activity', label: 'Activity', icon: <Activity className="h-4 w-4" /> },
          ]} />
          {tab === 'overview' && (
            <div className="space-y-5">
              {c.status_category === 'closed' && c.closure_comment && (
                <Notice tone="success" title={`Closed${c.closed_at ? ` on ${dateTime(c.closed_at)}` : ''}`}>{c.closure_comment}</Notice>
              )}
              <Card>
                <CardHeading title="Description" />
                <p className="whitespace-pre-wrap px-5 pb-5 pt-2 text-[15px] leading-relaxed text-slate-700">{c.description || <span className="text-slate-400">No description was added.</span>}</p>
              </Card>
              <div>
                <h2 className="mb-3 text-[15px] font-semibold text-slate-900">Latest activity</h2>
                <ActivityPanel complaintId={c.id} limit={4} />
                <button type="button" onClick={() => setTab('activity')} className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-800">See all activity</button>
              </div>
            </div>
          )}
          {tab === 'comments' && <CommentsPanel complaintId={c.id} />}
          {tab === 'files' && <FilesPanel complaintId={c.id} />}
          {tab === 'activity' && <ActivityPanel complaintId={c.id} />}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6">
          <Card>
            <CardHeading title="People" action={can('complaints.assign') ? <Button variant="soft" size="sm" onClick={() => setAssigning(true)}><UserPlus className="h-3.5 w-3.5" /> Assign</Button> : undefined} />
            <div className="space-y-3 px-5 pb-5 pt-3">
              <div className="flex items-center gap-3">
                {c.owner_name ? <Avatar name={c.owner_name} size="lg" /> : <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400">?</span>}
                <div><p className="text-sm font-semibold text-slate-900">{c.owner_name ?? 'Nobody yet'}</p><p className="text-xs text-slate-500">Owner</p></div>
              </div>
              {c.assignees.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs text-slate-500">Also working on this</p>
                  <ul className="space-y-2">{c.assignees.map((a) => <li key={a.id} className="flex items-center gap-2.5"><Avatar name={a.name} size="sm" /><span className="text-sm text-slate-700">{a.name}</span></li>)}</ul>
                </div>
              )}
            </div>
          </Card>
          <Card>
            <CardHeading title="Details" />
            <dl className="divide-y divide-slate-100 px-5 pb-3 pt-1">
              <Fact label="Due"><DueLabel complaint={c} /></Fact>
              <Fact label="Customer">{c.customer_name}</Fact>
              <Fact label="Customer ref.">{c.customer_reference_number}</Fact>
              <Fact label="Product">{c.product_name}</Fact>
              <Fact label="Part number">{c.part_number}</Fact>
              <Fact label="Batch / lot">{c.batch_number}</Fact>
              <Fact label="Quantity">{c.quantity_affected?.toLocaleString()}</Fact>
              <Fact label="Defect type">{c.defect_category_name}</Fact>
              <Fact label="Reported via">{SOURCE_LABEL[c.source]}</Fact>
              <Fact label="Created">{dateTime(c.created_at)}</Fact>
              {finished && c.closed_at && <Fact label="Closed">{dateTime(c.closed_at)}</Fact>}
            </dl>
          </Card>
        </aside>
      </div>

      {statuses.data && <ChangeStatusModal complaint={c} statuses={statuses.data} open={changing} onOpenChange={setChanging} />}
      <AssignModal complaint={c} open={assigning} onOpenChange={setAssigning} />
      <ComplaintFormDrawer open={editing} onOpenChange={setEditing} complaint={c} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete this complaint?" description={`${c.number} will be removed from lists and the dashboard. This is recorded in the audit log.`} confirmLabel="Delete complaint" danger loading={del.isPending} onConfirm={() => del.mutate()} />
    </>
  )
}
