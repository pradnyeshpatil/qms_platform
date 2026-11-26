import { useMutation } from '@tanstack/react-query'
import { Activity, ArrowLeft, Check, History, ListTodo, MessageSquare, Paperclip, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/kit/button'
import { Card } from '@/components/kit/card'
import { ErrorPanel, Notice, Skeleton } from '@/components/kit/feedback'
import { FormField, SelectInput, TextInput } from '@/components/kit/inputs'
import { ConfirmDialog, Modal } from '@/components/kit/overlay'
import { api, ApiError, tenantPath } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCan } from '@/features/auth/auth'
import { ActivityPanel } from '@/features/complaints/ActivityPanel'
import { useEmployeeOptions } from '@/features/complaints/api'
import { CommentsPanel } from '@/features/complaints/CommentsPanel'
import { FilesPanel } from '@/features/complaints/FilesPanel'
import { TasksPanel } from '@/features/tasks/TasksPanel'
import { useSlug } from '@/layout/AppLayout'
import { isConflict, useCustomFields, useRefreshReport, useReport } from './api'
import { CustomFieldsCard } from './CustomFields'
import { employeeName } from './fields'
import { RevisionsPanel } from './RevisionsPanel'
import { FISHBONE, ROWS, SECTIONS, WHYS } from './sections'
import { RowList, SectionHeader, SingleSection } from './SectionViews'
import { ProgressBar, ReportStatus } from './StatusBadge'
import { WorkflowBar } from './WorkflowBar'
import type { EightDDetail, SectionCode } from './types'

type Extra = 'tasks' | 'comments' | 'files' | 'activity' | 'revisions'
const EXTRAS: { value: Extra; label: string; icon: typeof ListTodo }[] = [
  { value: 'tasks', label: 'Tasks', icon: ListTodo }, { value: 'comments', label: 'Comments', icon: MessageSquare },
  { value: 'files', label: 'Evidence', icon: Paperclip }, { value: 'activity', label: 'Activity', icon: Activity }, { value: 'revisions', label: 'Snapshots', icon: History },
]

function EditHeaderModal({ report, open, onOpenChange }: { report: EightDDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const slug = useSlug()
  const refresh = useRefreshReport()
  const people = useEmployeeOptions(open)
  const [title, setTitle] = useState(report.title)
  const [target, setTarget] = useState(report.target_close_date ?? '')
  const [leader, setLeader] = useState(report.team_leader ?? '')
  const [approver, setApprover] = useState(report.approver ?? '')
  const m = useMutation({
    mutationFn: () => api(tenantPath(slug, `eight-d-reports/${report.id}/`), { method: 'PATCH', body: { title, target_close_date: target || null, team_leader: leader || null, approver: approver || null, version: report.version } }),
    onSuccess: () => { refresh(); onOpenChange(false); toast.success('Saved') },
  })
  const opts = (people.data ?? []).map((p) => <option key={p.id} value={p.id}>{employeeName(p)}</option>)
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Report details"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={m.isPending} disabled={!title.trim()} onClick={() => m.mutate()}>Save</Button></>}>
      <div className="space-y-4">
        {m.error && (isConflict(m.error) ? <Notice tone="warning" title="Someone else saved first">Close this and reopen it to see their changes.</Notice> : <Notice title="Couldn’t save">{m.error instanceof ApiError && m.error.isFieldValidation ? Object.values(m.error.fieldErrors).join(' ') : m.error.message}</Notice>)}
        <FormField label="Title" htmlFor="h-title"><TextInput id="h-title" value={title} onChange={(e) => setTitle(e.target.value)} /></FormField>
        <FormField label="Target close date" htmlFor="h-target" optional><TextInput id="h-target" type="date" value={target} onChange={(e) => setTarget(e.target.value)} /></FormField>
        {people.data && <>
          <FormField label="Team leader" htmlFor="h-leader"><SelectInput id="h-leader" value={leader} onChange={(e) => setLeader(e.target.value)}><option value="">Nobody</option>{opts}</SelectInput></FormField>
          <FormField label="Approver" htmlFor="h-approver"><SelectInput id="h-approver" value={approver} onChange={(e) => setApprover(e.target.value)}><option value="">Not chosen</option>{opts}</SelectInput></FormField>
        </>}
      </div>
    </Modal>
  )
}

export function EightDDetailPage() {
  const slug = useSlug()
  const can = useCan()
  const { id } = useParams()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const q = useReport(id)
  const people = useEmployeeOptions(can('users.view'))
  const customDefs = useCustomFields()
  const refresh = useRefreshReport()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const view = (sp.get('s') ?? 'D0') as SectionCode | Extra
  const go = (v: string) => { const n = new URLSearchParams(sp); n.set('s', v); setSp(n, { replace: true }) }
  const del = useMutation({
    mutationFn: () => api(tenantPath(slug, `eight-d-reports/${id}/`), { method: 'DELETE' }),
    onSuccess: () => { refresh(); toast.success('Draft deleted'); nav(`/${slug}/eight-d`) }, onError: (e: Error) => toast.error(e.message),
  })

  if (q.isLoading) return <div className="space-y-6" role="status" aria-label="Loading report"><Skeleton className="h-4 w-32" /><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>
  if (q.isError) {
    const gone = q.error instanceof ApiError && q.error.status === 404
    return <Card><ErrorPanel error={gone ? new Error('We couldn’t find that report. It may have been deleted, or you may not have access.') : q.error} onRetry={gone ? undefined : () => q.refetch()} /><div className="pb-8 text-center"><Link className="text-sm font-medium text-indigo-600" to={`/${slug}/eight-d`}>Back to 8D reports</Link></div></Card>
  }
  const r = q.data!
  const canEdit = can('eight_d_reports.update') && !r.is_locked
  const lastApproval = r.approvals[r.approvals.length - 1]
  const section = r.sections.find((s) => s.code === view)
  const def = SECTIONS.find((s) => s.code === view)

  return (
    <>
      <Link to={`/${slug}/eight-d`} className="mb-4 inline-flex items-center gap-1.5 rounded-lg text-sm text-slate-500 transition-colors hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> All 8D reports</Link>
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{r.number}</span>
              <ReportStatus status={r.status} />
              {r.revision > 1 && <span className="text-xs font-medium text-slate-500">Revision {r.revision}</span>}
            </div>
            <h1 className="text-2xl font-semibold leading-snug tracking-tight text-slate-900">{r.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              For <Link to={`/${slug}/complaints/${r.complaint}`} className="font-medium text-indigo-600 hover:underline">{r.complaint_number}</Link> · {r.customer_name}
              {r.team_leader_name && <> · Leader {r.team_leader_name}</>}{r.approver_name && <> · Approver {r.approver_name}</>}
              {r.target_close_date && <> · Target {shortDate(r.target_close_date)}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Details</Button>}
            {r.status === 'draft' && can('eight_d_reports.update') && <Button variant="danger-soft" size="sm" loading={del.isPending} onClick={() => setDeleting(true)}>Delete draft</Button>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-48 flex-1 max-w-md"><ProgressBar percent={r.completion.percent} /><p className="mt-1 text-xs text-slate-500">{r.completion.complete} of {r.completion.total} sections complete{r.completion.missing_required.length > 0 && <> · still required: {r.completion.missing_required.join(', ')}</>}</p></div>
          <WorkflowBar report={r} people={people.data} />
        </div>
      </Card>

      {customDefs.data && <div className="mb-5"><CustomFieldsCard reportId={r.id} section="" title="Report fields" defs={customDefs.data} data={r.custom_data} schema={r.custom_schema} version={r.version} canEdit={canEdit} /></div>}
      {r.status === 'in_progress' && lastApproval?.decision === 'rejected' && lastApproval.revision === r.revision && <div className="mb-5"><Notice tone="warning" title={`Rejected by ${lastApproval.approver_name}`}>{lastApproval.comment}</Notice></div>}
      {r.status === 'in_progress' && r.revision > 1 && r.reopen_reason && <div className="mb-5"><Notice tone="info" title={`Reopened as revision ${r.revision}`}>{r.reopen_reason}</Notice></div>}
      {r.is_locked && <div className="mb-5"><Notice tone="info" title="This report is read-only">{r.status === 'pending_approval' ? 'It is waiting for approval. A rejection makes it editable again.' : 'It is approved and locked. Reopen it to make changes as a new revision.'}</Notice></div>}

      <div className="grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav aria-label="Report sections" className="lg:sticky lg:top-6">
          <Card className="p-2">
            <ul className="space-y-0.5">
              {SECTIONS.map((d) => {
                const s = r.sections.find((x) => x.code === d.code)!
                const active = view === d.code
                return (
                  <li key={d.code}>
                    <button type="button" onClick={() => go(d.code)} aria-current={active ? 'page' : undefined}
                      className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60', active ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-50')}>
                      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', s.status === 'complete' ? 'bg-emerald-500 text-white' : s.status === 'in_progress' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500')}>
                        {s.status === 'complete' ? <Check className="h-3.5 w-3.5" aria-label="Complete" /> : d.code}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="my-2 h-px bg-slate-100" />
            <ul className="space-y-0.5">
              {EXTRAS.map(({ value, label, icon: Icon }) => (
                <li key={value}>
                  <button type="button" onClick={() => go(value)} aria-current={view === value ? 'page' : undefined}
                    className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60', view === value ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-50')}>
                    <Icon className="h-4 w-4 shrink-0" /> {label}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </nav>

        <div className="min-w-0 space-y-5">
          {def && section && (
            <>
              <SectionHeader report={r} section={section} def={def} canEdit={canEdit} people={people.data} />
              {def.single && <SingleSection key={`${r.id}-${def.code}`} report={r} def={def} people={people.data} canEdit={canEdit} />}
              {ROWS[def.code] && <RowList report={r} def={ROWS[def.code]} people={people.data} canEdit={canEdit} />}
              {customDefs.data && <CustomFieldsCard reportId={r.id} section={def.code} title={`${def.code} additional fields`} defs={customDefs.data} data={section.custom_data} schema={section.custom_schema} version={section.version} canEdit={canEdit} />}
              {def.code === 'D4' && (
                <div className="space-y-6 pt-2">
                  <RowList report={r} def={WHYS} people={people.data} canEdit={canEdit} title="5 Whys" />
                  <RowList report={r} def={FISHBONE} people={people.data} canEdit={canEdit} title="Fishbone causes" />
                </div>
              )}
            </>
          )}
          {view === 'tasks' && <TasksPanel reportId={r.id} />}
          {view === 'comments' && <CommentsPanel complaintId={r.id} targetType="eight_d_report" />}
          {view === 'files' && <FilesPanel complaintId={r.id} targetType="eight_d_report" />}
          {view === 'activity' && <ActivityPanel complaintId={r.id} targetType="eight_d_report" />}
          {view === 'revisions' && <RevisionsPanel report={r} />}
        </div>
      </div>
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete this draft?" description={`${r.number} is removed. Only drafts can be deleted; this is recorded in the audit log.`} confirmLabel="Delete draft" danger loading={del.isPending} onConfirm={() => del.mutate()} />
      <EditHeaderModal key={r.version} report={r} open={editing} onOpenChange={setEditing} />
    </>
  )
}
