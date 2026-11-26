import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ListTodo, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/kit/button'
import { Card } from '@/components/kit/card'
import { EmptyPanel, Notice } from '@/components/kit/feedback'
import { ConfirmDialog, Modal } from '@/components/kit/overlay'
import { Chip } from '@/components/kit/pills'
import { api, ApiError, tenantPath } from '@/lib/api'
import type { Employee } from '@/lib/types'
import { useCan } from '@/features/auth/auth'
import { useSlug } from '@/layout/AppLayout'
import { isConflict, useRefreshReport } from './api'
import { changedKeys, employeeName, FieldInput, toBody, toValues, type Values } from './fields'
import type { Field, RowDef, SectionDef } from './sections'
import { TASK_STATUS, type EightDDetail, type Row, type Section, type TaskStatus } from './types'

const prettify = (v: unknown) => String(v ?? '').replace(/_/g, ' ')

function ConflictNotice({ onReload }: { onReload: () => void }) {
  return (
    <Notice tone="warning" title="Someone else saved this first">
      Reload to see their changes, then re-apply yours. <button type="button" onClick={onReload} className="font-semibold underline">Reload now</button>
    </Notice>
  )
}

/** Complete / reopen a section and show who owns it. */
export function SectionHeader({ report, section, def, canEdit, people }: { report: EightDDetail; section: Section; def: SectionDef; canEdit: boolean; people: Employee[] | undefined }) {
  const slug = useSlug()
  const refresh = useRefreshReport()
  const set = useMutation({
    mutationFn: (status: string) => api(tenantPath(slug, `eight-d-reports/${report.id}/sections/${section.code}/status/`), { method: 'POST', body: { status } }),
    onSuccess: (_d, status) => { refresh(); toast.success(status === 'complete' ? `${section.code} marked complete` : `${section.code} reopened`) },
    onError: (e: Error) => toast.error(e.message),
  })
  const owner = useMutation({
    mutationFn: (id: string) => api(tenantPath(slug, `eight-d-reports/${report.id}/sections/${section.code}/owner/`), { method: 'POST', body: { owner: id || null } }),
    onSuccess: () => { refresh(); toast.success('Owner updated') }, onError: (e: Error) => toast.error(e.message),
  })
  const done = section.status === 'complete'
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{section.code} · {def.title}</h2>
          <Chip tone={done ? 'emerald' : section.status === 'in_progress' ? 'indigo' : 'slate'}>{done ? 'Complete' : section.status === 'in_progress' ? 'In progress' : 'Not started'}</Chip>
          {def.required && !done && <Chip tone="amber">Required</Chip>}
        </div>
        <p className="mt-1 text-sm text-slate-500">{def.summary}{section.owner_name && !(canEdit && people) && <> · Owner: <span className="font-medium text-slate-700">{section.owner_name}</span></>}</p>
        {canEdit && people && (
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">Owner
            <select aria-label={`${section.code} owner`} className="h-8 rounded-lg bg-white px-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/70" value={section.owner ?? ''} disabled={owner.isPending} onChange={(e) => owner.mutate(e.target.value)}>
              <option value="">Nobody</option>{people.map((p) => <option key={p.id} value={p.id}>{employeeName(p)}</option>)}
            </select>
          </label>
        )}
      </div>
      {canEdit && (done
        ? <Button variant="secondary" size="sm" loading={set.isPending} onClick={() => set.mutate('in_progress')}><RotateCcw className="h-3.5 w-3.5" /> Reopen section</Button>
        : <Button variant="soft" size="sm" loading={set.isPending} onClick={() => set.mutate('complete')}><CheckCircle2 className="h-3.5 w-3.5" /> Mark complete</Button>)}
    </div>
  )
}

/** D0 / D2 / D4 / D8: one record edited in place with optimistic locking. */
export function SingleSection({ report, def, people, canEdit }: { report: EightDDetail; def: SectionDef; people: Employee[] | undefined; canEdit: boolean }) {
  const slug = useSlug()
  const refresh = useRefreshReport()
  const { fields, endpoint, field } = def.single!
  const record = report[field] as Row
  const [values, setValues] = useState<Values>(() => toValues(fields, record))
  const [conflict, setConflict] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const base = toValues(fields, record)
  useEffect(() => { setValues(toValues(fields, record)); setConflict(false) }, [record.id, record.version]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = changedKeys(fields, values, base).length > 0
  const save = useMutation({
    mutationFn: () => api(tenantPath(slug, `eight-d-reports/${report.id}/data/${endpoint}/`), { method: 'PATCH', body: { ...toBody(fields, values), version: record.version } }),
    onSuccess: () => { setErrors({}); refresh(); toast.success('Saved') },
    onError: (e: Error) => {
      if (isConflict(e)) return setConflict(true)
      if (e instanceof ApiError && e.isFieldValidation) return setErrors(e.fieldErrors)
      toast.error(e.message)
    },
  })
  return (
    <Card className="space-y-4 p-5">
      {conflict && <ConflictNotice onReload={() => { refresh(); setConflict(false) }} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.kind === 'textarea' ? 'sm:col-span-2' : undefined}>
            <FieldInput field={f} value={values[f.key]} people={people} disabled={!canEdit} error={errors[f.key]} idPrefix={def.code} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" disabled={!dirty} onClick={() => setValues(base)}>Discard changes</Button>
          <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>Save {def.code}</Button>
        </div>
      )}
    </Card>
  )
}

function RowModal({ report, def, row, people, open, onOpenChange }: { report: EightDDetail; def: RowDef; row: Row | null; people: Employee[] | undefined; open: boolean; onOpenChange: (o: boolean) => void }) {
  const slug = useSlug()
  const refresh = useRefreshReport()
  const [values, setValues] = useState<Values>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState(false)
  useEffect(() => { if (open) { setValues(toValues(def.fields, row ?? undefined)); setErrors({}); setConflict(false) } }, [open, row, def])
  const save = useMutation({
    mutationFn: () => row
      ? api(tenantPath(slug, `eight-d-${def.resource}/${row.id}/`), { method: 'PATCH', body: { ...toBody(def.fields, values), version: row.version } })
      : api(tenantPath(slug, `eight-d-${def.resource}/`), { method: 'POST', body: { ...toBody(def.fields, values), report: report.id } }),
    onSuccess: () => { refresh(); onOpenChange(false); toast.success(row ? 'Saved' : 'Added') },
    onError: (e: Error) => {
      if (isConflict(e)) return setConflict(true)
      if (e instanceof ApiError && e.isFieldValidation) return setErrors(e.fieldErrors)
      toast.error(e.message)
    },
  })
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`${row ? 'Edit' : 'Add'} ${def.noun}`}
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>{row ? 'Save' : 'Add'}</Button></>}>
      <div className="space-y-4">
        {conflict && <ConflictNotice onReload={() => { refresh(); onOpenChange(false) }} />}
        {def.fields.map((f: Field) => <FieldInput key={f.key} field={f} value={values[f.key]} people={people} error={errors[f.key]} idPrefix={def.resource} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />)}
      </div>
    </Modal>
  )
}

/** A list section: rows with add / edit / delete and, for action rows, create-a-task. */
export function RowList({ report, def, people, canEdit, title }: { report: EightDDetail; def: RowDef; people: Employee[] | undefined; canEdit: boolean; title?: string }) {
  const slug = useSlug()
  const can = useCan()
  const qc = useQueryClient()
  const refresh = useRefreshReport()
  const rows = report[def.field as keyof EightDDetail] as Row[]
  const [editing, setEditing] = useState<Row | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Row | null>(null)
  const del = useMutation({
    mutationFn: (r: Row) => api(tenantPath(slug, `eight-d-${def.resource}/${r.id}/`), { method: 'DELETE' }),
    onSuccess: () => { setRemoving(null); refresh(); toast.success('Removed') },
    onError: (e: Error) => { setRemoving(null); toast.error(e.message) },
  })
  const makeTask = useMutation({
    mutationFn: (r: Row) => api(tenantPath(slug, `eight-d-${def.resource}/${r.id}/create-task/`), { method: 'POST', body: {} }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: [slug, 'tasks'] }); toast.success('Task created') },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {title ? <h3 className="text-sm font-semibold text-slate-800">{title}</h3> : <span />}
        {canEdit && <Button size="sm" variant="soft" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add {def.noun}</Button>}
      </div>
      {rows.length === 0 ? <Card><EmptyPanel title={`No ${def.noun}s yet`} hint={def.empty} /></Card> : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const task = r.task as { id: string; status: TaskStatus } | null | undefined
            return (
              <li key={r.id}>
                <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-sm font-medium text-slate-900">{String(r[def.titleKey] ?? '') || '—'}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {r.is_leader === true && <Chip tone="indigo">Leader</Chip>}
                      {r.is_root_cause === true && <Chip tone="rose">Root cause</Chip>}
                      {r.decision === 'selected' && <Chip tone="emerald">Selected</Chip>}
                      {r.is_effective === true && <Chip tone="emerald">Effective</Chip>}
                      {r.is_effective === false && <Chip tone="rose">Not effective</Chip>}
                      {(def.metaKeys ?? []).filter((k) => r[k] && !(k === 'decision' && r.decision === 'selected')).map((k) => <Chip key={k}>{prettify(r[k]).slice(0, 60)}</Chip>)}
                      {Boolean(r.due_date) && <Chip tone="amber">Due {String(r.due_date)}</Chip>}
                      {Boolean(r.completed_date) && <Chip tone="emerald">Done {String(r.completed_date)}</Chip>}
                      {task && <Link to={`/${slug}/tasks`}><Chip tone="indigo"><ListTodo className="h-3 w-3" /> Task: {TASK_STATUS[task.status].label}</Chip></Link>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {def.taskable && !task && can('tasks.create') && <Button size="sm" variant="ghost" loading={makeTask.isPending && makeTask.variables?.id === r.id} onClick={() => makeTask.mutate(r)}><ListTodo className="h-3.5 w-3.5" /> Create task</Button>}
                    {canEdit && <Button size="icon" variant="ghost" aria-label={`Edit ${def.noun}`} onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>}
                    {canEdit && <Button size="icon" variant="ghost" aria-label={`Remove ${def.noun}`} onClick={() => setRemoving(r)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      <RowModal report={report} def={def} row={editing} people={people} open={adding || !!editing} onOpenChange={(o) => { if (!o) { setAdding(false); setEditing(null) } }} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={`Remove this ${def.noun}?`} description="It is removed from the report. The change stays in the audit log." confirmLabel="Remove" danger loading={del.isPending} onConfirm={() => removing && del.mutate(removing)} />
    </div>
  )
}
