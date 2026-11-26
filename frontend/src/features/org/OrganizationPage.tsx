import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Factory, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/kit/button'
import { Card, CardHeading, PageTitle } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton, Notice } from '@/components/kit/feedback'
import { SelectInput, Switch, TextInput } from '@/components/kit/inputs'
import { Reveal } from '@/components/kit/motion'
import { ConfirmDialog } from '@/components/kit/overlay'
import { Chip } from '@/components/kit/pills'
import { useCan } from '@/features/auth/auth'
import { api, tenantPath } from '@/lib/api'
import { useSlug } from '@/layout/AppLayout'
import { useDepartments, usePlants } from './hooks'

type Resource = 'plants' | 'departments'
type Item = { id: string; name: string; is_active: boolean }

function useOrgMutation(resource: Resource, noun: string) {
  const slug = useSlug()
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: [slug, resource] })
  const fail = (e: Error) => toast.error(e.message)
  return {
    create: useMutation({ mutationFn: (body: object) => api(tenantPath(slug, `${resource}/`), { method: 'POST', body }), onSuccess: () => { done(); toast.success(`${noun} added`) } }),
    patch: useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => api(tenantPath(slug, `${resource}/${id}/`), { method: 'PATCH', body }), onSuccess: done, onError: fail }),
    remove: useMutation({ mutationFn: (id: string) => api(tenantPath(slug, `${resource}/${id}/`), { method: 'DELETE' }), onSuccess: () => { done(); toast.success(`${noun} deleted`) }, onError: fail }),
  }
}

function OrgRow({ item, index, sub, canManage, onToggle, onDelete }: { item: Item; index: number; sub?: string; canManage: boolean; onToggle: (v: boolean) => void; onDelete: () => void }) {
  return (
    <Reveal as="li" index={index} className="flex items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${item.is_active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{item.name}</p>
        {(sub || !item.is_active) && <div className="mt-1 flex flex-wrap items-center gap-1.5">{sub && <span className="text-xs text-slate-500">{sub}</span>}{!item.is_active && <Chip>Inactive</Chip>}</div>}
      </div>
      {canManage && (
        <>
          <Switch label={`${item.name} active`} checked={item.is_active} onChange={onToggle} />
          <Button variant="ghost" size="icon" aria-label={`Delete ${item.name}`} className="hover:bg-rose-50 hover:text-rose-600" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </>
      )}
    </Reveal>
  )
}

function Plants({ canManage }: { canManage: boolean }) {
  const q = usePlants()
  const m = useOrgMutation('plants', 'Plant')
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<Item | null>(null)
  const err = m.create.error ?? m.patch.error ?? m.remove.error
  return (
    <Card>
      <CardHeading title="Plants" hint="The sites where you make or ship product." />
      {canManage && (
        <form className="flex gap-2 px-5 pb-1 pt-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) m.create.mutate({ name }, { onSuccess: () => setName('') }) }}>
          <TextInput aria-label="New plant name" placeholder="e.g. Pune plant" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" loading={m.create.isPending} disabled={!name.trim()}><Plus className="h-4 w-4" /> Add</Button>
        </form>
      )}
      {err && <div className="px-5 pt-3"><Notice>{err.message}</Notice></div>}
      {q.isLoading ? <ListSkeleton rows={3} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
        <EmptyPanel icon={<Factory className="h-6 w-6" />} title="No plants yet" hint={canManage ? 'Add a plant above to group departments and people by site.' : undefined} />
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 pb-2">
          {q.data!.map((p, i) => <OrgRow key={p.id} item={p} index={i} canManage={canManage} onToggle={(v) => m.patch.mutate({ id: p.id, body: { is_active: v } })} onDelete={() => setDeleting(p)} />)}
        </ul>
      )}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Delete this plant?" description={deleting ? `“${deleting.name}” will be removed. If it is in use, deactivate it instead.` : ''} confirmLabel="Delete" danger loading={m.remove.isPending}
        onConfirm={() => deleting && m.remove.mutate(deleting.id, { onSettled: () => setDeleting(null) })} />
    </Card>
  )
}

function Departments({ canManage }: { canManage: boolean }) {
  const q = useDepartments()
  const plants = usePlants()
  const m = useOrgMutation('departments', 'Department')
  const [name, setName] = useState('')
  const [plant, setPlant] = useState('')
  const [deleting, setDeleting] = useState<Item | null>(null)
  const plantName = (id: string | null) => plants.data?.find((p) => p.id === id)?.name
  const err = m.create.error ?? m.patch.error ?? m.remove.error
  return (
    <Card>
      <CardHeading title="Departments" hint="Teams within your company. Plant-specific or company-wide." />
      {canManage && (
        <form className="flex flex-wrap gap-2 px-5 pb-1 pt-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) m.create.mutate({ name, plant: plant || null }, { onSuccess: () => setName('') }) }}>
          <div className="min-w-40 flex-1"><TextInput aria-label="New department name" placeholder="e.g. Quality assurance" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="w-44"><SelectInput aria-label="Plant" value={plant} onChange={(e) => setPlant(e.target.value)}>
            <option value="">Company-wide</option>
            {plants.data?.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectInput></div>
          <Button type="submit" loading={m.create.isPending} disabled={!name.trim()}><Plus className="h-4 w-4" /> Add</Button>
        </form>
      )}
      {err && <div className="px-5 pt-3"><Notice>{err.message}</Notice></div>}
      {q.isLoading ? <ListSkeleton rows={3} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
        <EmptyPanel icon={<Building2 className="h-6 w-6" />} title="No departments yet" hint={canManage ? 'Add a department above.' : undefined} />
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 pb-2">
          {q.data!.map((d, i) => <OrgRow key={d.id} item={d} index={i} sub={plantName(d.plant) ?? 'Company-wide'} canManage={canManage} onToggle={(v) => m.patch.mutate({ id: d.id, body: { is_active: v } })} onDelete={() => setDeleting(d)} />)}
        </ul>
      )}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Delete this department?" description={deleting ? `“${deleting.name}” will be removed. If it is in use, deactivate it instead.` : ''} confirmLabel="Delete" danger loading={m.remove.isPending}
        onConfirm={() => deleting && m.remove.mutate(deleting.id, { onSettled: () => setDeleting(null) })} />
    </Card>
  )
}

export function OrganizationPage() {
  const can = useCan()
  return (
    <>
      <PageTitle title="Plants & departments" subtitle="How your company is organised. Used to scope who sees which complaints." />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Plants canManage={can('plants.manage')} />
        <Departments canManage={can('departments.manage')} />
      </div>
    </>
  )
}
