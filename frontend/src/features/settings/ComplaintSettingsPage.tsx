import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Check, Info, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/kit/button'
import { Card, CardHeading, PageTitle } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton, Notice } from '@/components/kit/feedback'
import { FormField, SelectInput, Switch, TextInput } from '@/components/kit/inputs'
import { Reveal } from '@/components/kit/motion'
import { ConfirmDialog, Modal } from '@/components/kit/overlay'
import { Chip, StatusPill } from '@/components/kit/pills'
import { api, ApiError, tenantPath } from '@/lib/api'
import { CATEGORY_LABEL, STATUS_CATEGORIES, type DefectCategory, type StatusCategory, type WorkflowStatus } from '@/lib/types'
import { RequirePermission } from '@/features/auth/auth'
import { useDefectCategories, useStatuses } from '@/features/complaints/api'
import { useSlug } from '@/layout/AppLayout'

const CATEGORY_HELP: Record<StatusCategory, string> = {
  open: 'Newly logged, work has not started',
  in_progress: 'Being investigated or fixed',
  waiting: 'Waiting on the customer or a supplier',
  resolved: 'Fixed, awaiting final sign-off. No longer counts as open or overdue',
  closed: 'Finished. A closing comment is required',
}

type Draft = { name: string; category: StatusCategory; is_default: boolean; is_active: boolean; allowed_next: string[] }

function StatusDialog({ open, onOpenChange, status, all }: { open: boolean; onOpenChange: (o: boolean) => void; status?: WorkflowStatus; all: WorkflowStatus[] }) {
  const slug = useSlug()
  const qc = useQueryClient()
  const blank: Draft = { name: '', category: 'in_progress', is_default: false, is_active: true, allowed_next: [] }
  const [d, setD] = useState<Draft>(blank)
  const [limit, setLimit] = useState(false)
  useEffect(() => {
    if (!open) return
    const next = status ? { name: status.name, category: status.category, is_default: status.is_default, is_active: status.is_active, allowed_next: status.allowed_next } : blank
    setD(next); setLimit(next.allowed_next.length > 0)
  }, [open, status])
  const m = useMutation({
    mutationFn: () => api<WorkflowStatus>(tenantPath(slug, status ? `complaint-statuses/${status.id}/` : 'complaint-statuses/'), { method: status ? 'PATCH' : 'POST', body: { ...d, allowed_next: limit ? d.allowed_next : [] } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [slug, 'statuses'] }); onOpenChange(false); toast.success(status ? 'Status updated' : 'Status added') },
  })
  const fe = m.error instanceof ApiError ? m.error.fieldErrors : {}
  const general = m.error && !Object.keys(fe).length ? m.error.message : ''
  const others = all.filter((s) => s.id !== status?.id && s.is_active)
  const toggleNext = (id: string) => setD((x) => ({ ...x, allowed_next: x.allowed_next.includes(id) ? x.allowed_next.filter((i) => i !== id) : [...x.allowed_next, id] }))
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={status ? `Edit “${status.name}”` : 'Add a status'} description="Statuses are the steps a complaint moves through."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={m.isPending} disabled={!d.name.trim()} onClick={() => m.mutate()}>{status ? 'Save' : 'Add status'}</Button></>}>
      <div className="space-y-5">
        <FormField label="Name" htmlFor="st-name" error={fe.name}><TextInput id="st-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Awaiting parts" aria-invalid={!!fe.name} /></FormField>
        <FormField label="What kind of step is this?" htmlFor="st-cat" error={fe.category} hint={CATEGORY_HELP[d.category]}>
          <SelectInput id="st-cat" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as StatusCategory })}>{STATUS_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</SelectInput>
        </FormField>
        <div className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
          <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-slate-800">Start new complaints here</p><p className="text-xs text-slate-500">Only one status can be the starting point.</p></div><Switch label="Default status" checked={d.is_default} onChange={(v) => setD({ ...d, is_default: v })} /></div>
          {status && <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-slate-800">Active</p><p className="text-xs text-slate-500">Inactive statuses can’t be chosen, but existing complaints keep them.</p></div><Switch label="Active" checked={d.is_active} onChange={(v) => setD({ ...d, is_active: v })} /></div>}
          {(fe.is_default || fe.is_active) && <p role="alert" className="text-xs text-rose-600">{fe.is_default || fe.is_active}</p>}
        </div>
        <div>
          <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-slate-800">Limit what can come next</p><p className="text-xs text-slate-500">Off means a complaint can move to any status.</p></div><Switch label="Limit next statuses" checked={limit} onChange={setLimit} /></div>
          {limit && (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {others.map((s) => (
                <li key={s.id}><label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 ring-1 ring-slate-200 transition hover:bg-slate-50 has-[:checked]:bg-indigo-50/70 has-[:checked]:ring-indigo-300">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={d.allowed_next.includes(s.id)} onChange={() => toggleNext(s.id)} /><span className="truncate text-sm text-slate-700">{s.name}</span>
                </label></li>
              ))}
            </ul>
          )}
        </div>
        {general && <Notice title="Couldn’t save">{general}</Notice>}
      </div>
    </Modal>
  )
}

function StatusesCard() {
  const slug = useSlug()
  const qc = useQueryClient()
  const q = useStatuses()
  const [editing, setEditing] = useState<WorkflowStatus | undefined>()
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<WorkflowStatus | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: [slug, 'statuses'] })
  const rows = [...(q.data ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const swap = useMutation({
    mutationFn: async ([a, b]: [WorkflowStatus, WorkflowStatus]) => {
      await api(tenantPath(slug, `complaint-statuses/${a.id}/`), { method: 'PATCH', body: { sort_order: b.sort_order } })
      await api(tenantPath(slug, `complaint-statuses/${b.id}/`), { method: 'PATCH', body: { sort_order: a.sort_order } })
    },
    onSuccess: refresh, onError: (e: Error) => toast.error(e.message),
  })
  const del = useMutation({
    mutationFn: (s: WorkflowStatus) => api(tenantPath(slug, `complaint-statuses/${s.id}/`), { method: 'DELETE' }),
    onSuccess: () => { setDeleting(null); refresh(); toast.success('Status deleted') },
    onError: (e: Error) => { setDeleting(null); toast.error(e.message) },
  })
  return (
    <Card>
      <CardHeading title="Workflow statuses" hint="The steps every complaint moves through, in order." action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add status</Button>} />
      <div className="px-5 pb-2 pt-3">
        <Notice tone="info"><span className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>Each status has a <strong>kind</strong>. The kind, not the name, decides what counts as open, overdue, resolved or closed on the dashboard, so you can rename steps freely.</span></span></Notice>
      </div>
      {q.isLoading ? <ListSkeleton rows={4} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : (
        <ul className="divide-y divide-slate-100 pb-2">
          {rows.map((s, i) => (
            <Reveal as="li" key={s.id} index={i} className="flex items-center gap-3 px-5 py-3">
              <div className="flex flex-col">
                <button type="button" aria-label={`Move ${s.name} up`} disabled={i === 0 || swap.isPending} onClick={() => swap.mutate([s, rows[i - 1]])} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label={`Move ${s.name} down`} disabled={i === rows.length - 1 || swap.isPending} onClick={() => swap.mutate([s, rows[i + 1]])} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
              <span className="w-6 text-center text-xs tabular-nums text-slate-400">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${s.is_active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{s.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5"><StatusPill name={CATEGORY_LABEL[s.category]} category={s.category} />{s.is_default && <Chip tone="indigo">Starting status</Chip>}{!s.is_active && <Chip>Inactive</Chip>}{s.allowed_next.length > 0 && <Chip tone="amber">Limits next step</Chip>}</div>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} className="hover:bg-rose-50 hover:text-rose-600" onClick={() => setDeleting(s)}><Trash2 className="h-4 w-4" /></Button>
            </Reveal>
          ))}
        </ul>
      )}
      <StatusDialog open={adding} onOpenChange={setAdding} all={rows} />
      <StatusDialog open={!!editing} onOpenChange={(o) => !o && setEditing(undefined)} status={editing} all={rows} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Delete this status?" description={deleting ? `“${deleting.name}” will be removed. Statuses that complaints are using, the starting status, and the last “closed” status can’t be deleted.` : ''} confirmLabel="Delete" danger loading={del.isPending} onConfirm={() => deleting && del.mutate(deleting)} />
    </Card>
  )
}

function DefectRow({ d, index }: { d: DefectCategory; index: number }) {
  const slug = useSlug()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(d.name)
  const [confirm, setConfirm] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: [slug, 'defect-categories'] })
  const patch = useMutation({
    mutationFn: (body: Partial<DefectCategory>) => api(tenantPath(slug, `defect-categories/${d.id}/`), { method: 'PATCH', body }),
    onSuccess: () => { setEditing(false); refresh() }, onError: (e: Error) => toast.error(e.message),
  })
  const del = useMutation({
    mutationFn: () => api(tenantPath(slug, `defect-categories/${d.id}/`), { method: 'DELETE' }),
    onSuccess: () => { setConfirm(false); refresh(); toast.success('Defect type deleted') }, onError: (e: Error) => { setConfirm(false); toast.error(e.message) },
  })
  return (
    <Reveal as="li" index={index} className="flex items-center gap-3 px-5 py-3">
      {editing ? (
        <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) patch.mutate({ name }) }}>
          <TextInput aria-label="Defect type name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          <Button type="submit" size="icon" aria-label="Save name" loading={patch.isPending}><Check className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => { setEditing(false); setName(d.name) }}><X className="h-4 w-4" /></Button>
        </form>
      ) : (
        <>
          <p className={`min-w-0 flex-1 truncate text-sm font-medium ${d.is_active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{d.name}</p>
          <Switch label={`${d.name} active`} checked={d.is_active} onChange={(v) => patch.mutate({ is_active: v })} />
          <Button variant="ghost" size="icon" aria-label={`Rename ${d.name}`} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" aria-label={`Delete ${d.name}`} className="hover:bg-rose-50 hover:text-rose-600" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" /></Button>
        </>
      )}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this defect type?" description={`“${d.name}” will be removed. If complaints use it, deactivate it instead.`} confirmLabel="Delete" danger loading={del.isPending} onConfirm={() => del.mutate()} />
    </Reveal>
  )
}

function DefectsCard() {
  const slug = useSlug()
  const qc = useQueryClient()
  const q = useDefectCategories()
  const [name, setName] = useState('')
  const add = useMutation({
    mutationFn: () => api(tenantPath(slug, 'defect-categories/'), { method: 'POST', body: { name } }),
    onSuccess: () => { setName(''); qc.invalidateQueries({ queryKey: [slug, 'defect-categories'] }); toast.success('Defect type added') },
  })
  const err = add.error instanceof ApiError ? add.error.fieldErrors.name ?? add.error.message : add.error?.message
  return (
    <Card>
      <CardHeading title="Defect types" hint="What kind of problem a complaint is about. Used for filtering and reports." />
      <form className="flex gap-2 px-5 pb-1 pt-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate() }}>
        <TextInput aria-label="New defect type" placeholder="e.g. Weld quality" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err} />
        <Button type="submit" loading={add.isPending} disabled={!name.trim()}><Plus className="h-4 w-4" /> Add</Button>
      </form>
      {err && <p role="alert" className="px-5 pt-1 text-xs text-rose-600">{err}</p>}
      {q.isLoading ? <ListSkeleton rows={3} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : q.data!.length === 0 ? <EmptyPanel title="No defect types yet" hint="Add the kinds of problems you usually see." /> : (
        <ul className="mt-2 divide-y divide-slate-100 pb-2">{q.data!.map((d, i) => <DefectRow key={d.id} d={d} index={i} />)}</ul>
      )}
    </Card>
  )
}

export function ComplaintSettingsPage() {
  return (
    <RequirePermission permission="settings.manage">
      <PageTitle title="Complaint settings" subtitle="Shape how your team handles complaints. Changes apply to everyone in your workspace." />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <StatusesCard />
        <DefectsCard />
      </div>
    </RequirePermission>
  )
}
