import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/kit/button'
import { Card } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton, Notice } from '@/components/kit/feedback'
import { FormField, SelectInput, TextArea, TextInput } from '@/components/kit/inputs'
import { Modal } from '@/components/kit/overlay'
import { Chip } from '@/components/kit/pills'
import { api, qs, tenantPath } from '@/lib/api'
import { shortDate } from '@/lib/format'
import type { Employee, Page } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useCan } from '@/features/auth/auth'
import { employeeName } from '@/features/eight-d/fields'
import { TASK_PRIORITY, TASK_STATUS, type Task, type TaskPriority } from '@/features/eight-d/types'
import { useEmployeeOptions } from '@/features/complaints/api'
import { useSlug } from '@/layout/AppLayout'

export function useTaskMutations() {
  const slug = useSlug()
  const qc = useQueryClient()
  const done = () => { qc.invalidateQueries({ queryKey: [slug, 'tasks'] }); qc.invalidateQueries({ queryKey: [slug, 'eight-d'] }); qc.invalidateQueries({ queryKey: [slug, 'activity'] }) }
  const toggle = useMutation({
    mutationFn: (t: Task) => api<Task>(tenantPath(slug, `tasks/${t.id}/change-status/`), { method: 'POST', body: { status: t.status === 'done' ? 'todo' : 'done' } }),
    onSuccess: done, onError: (e: Error) => toast.error(e.message),
  })
  return { toggle, done }
}

export function TaskRow({ t, onToggle, busy, showLinks }: { t: Task; onToggle: () => void; busy: boolean; showLinks?: boolean }) {
  const can = useCan()
  const finished = t.status === 'done' || t.status === 'cancelled'
  return (
    <li className="flex items-start gap-3 py-3">
      <button type="button" aria-label={t.status === 'done' ? `Reopen ${t.title}` : `Complete ${t.title}`} disabled={busy || !can(t.status === 'done' ? 'tasks.update' : 'tasks.complete')} onClick={onToggle}
        className="mt-0.5 shrink-0 text-slate-300 transition hover:text-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
        {t.status === 'done' ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium text-slate-900', finished && 'text-slate-400 line-through')}>{t.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TASK_STATUS[t.status].pill)}>{TASK_STATUS[t.status].label}</span>
          {(t.priority === 'high' || t.priority === 'urgent') && <Chip tone={t.priority === 'urgent' ? 'rose' : 'amber'}>{TASK_PRIORITY[t.priority]}</Chip>}
          {t.due_date && <Chip tone={t.is_overdue ? 'rose' : 'slate'}>{t.is_overdue ? 'Overdue · ' : 'Due '}{shortDate(t.due_date)}</Chip>}
          <span className="text-xs text-slate-500">{t.assignee_name ?? 'Unassigned'}</span>
          {showLinks && t.complaint_number && <Chip>{t.complaint_number}</Chip>}
          {showLinks && t.report_number && <Chip tone="indigo">{t.report_number}{t.eight_d_section && ` ${t.eight_d_section}`}</Chip>}
        </div>
      </div>
    </li>
  )
}

export function NewTaskModal({ open, onOpenChange, complaintId, reportId, people }: { open: boolean; onOpenChange: (o: boolean) => void; complaintId?: string; reportId?: string; people: Employee[] | undefined }) {
  const slug = useSlug()
  const { done } = useTaskMutations()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const m = useMutation({
    mutationFn: () => api(tenantPath(slug, 'tasks/'), { method: 'POST', body: { title, description, priority, assignee: assignee || null, due_date: due || null, complaint: complaintId ?? null, eight_d_report: reportId ?? null } }),
    onSuccess: () => { done(); onOpenChange(false); setTitle(''); setDescription(''); setAssignee(''); setDue(''); toast.success('Task created') },
  })
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New task"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={m.isPending} disabled={!title.trim()} onClick={() => m.mutate()}>Create task</Button></>}>
      <div className="space-y-4">
        <FormField label="Title" htmlFor="t-title"><TextInput id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} /></FormField>
        <FormField label="Details" htmlFor="t-desc" optional><TextArea id="t-desc" className="min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          {people && <FormField label="Assignee" htmlFor="t-who" optional><SelectInput id="t-who" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Nobody</option>{people.map((p) => <option key={p.id} value={p.id}>{employeeName(p)}</option>)}</SelectInput></FormField>}
          <FormField label="Due" htmlFor="t-due" optional><TextInput id="t-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></FormField>
          <FormField label="Priority" htmlFor="t-pri"><SelectInput id="t-pri" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>{Object.entries(TASK_PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput></FormField>
        </div>
        {m.error && <Notice title="Couldn’t create the task">{m.error.message}</Notice>}
      </div>
    </Modal>
  )
}

/** Tasks tied to one complaint or one 8D report. */
export function TasksPanel({ complaintId, reportId }: { complaintId?: string; reportId?: string }) {
  const slug = useSlug()
  const can = useCan()
  const people = useEmployeeOptions(can('tasks.create'))
  const { toggle } = useTaskMutations()
  const [adding, setAdding] = useState(false)
  const q = useQuery({
    queryKey: [slug, 'tasks', 'panel', complaintId ?? '', reportId ?? ''],
    queryFn: () => api<Page<Task>>(tenantPath(slug, `tasks/${qs({ complaint: complaintId, eight_d_report: reportId, page_size: 100 })}`)),
  })
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-900">Tasks</h2>
        {can('tasks.create') && <Button size="sm" variant="soft" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> New task</Button>}
      </div>
      {q.isLoading ? <ListSkeleton rows={3} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : !q.data?.results.length ? (
        <EmptyPanel title="No tasks yet" hint="Create tasks from D3, D5, D6 and D7 actions, or add one here." />
      ) : (
        <ul className="divide-y divide-slate-100">{q.data.results.map((t) => <TaskRow key={t.id} t={t} busy={toggle.isPending} onToggle={() => toggle.mutate(t)} showLinks={!reportId} />)}</ul>
      )}
      <NewTaskModal open={adding} onOpenChange={setAdding} complaintId={complaintId} reportId={reportId} people={people.data} />
    </Card>
  )
}
