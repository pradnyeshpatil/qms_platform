import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form-controls'
import { Badge, Card, CardHeader, EmptyState, ErrorState, Loading } from '@/components/ui/misc'
import { useCan } from '@/features/auth/auth'
import { api, tenantPath } from '@/lib/api'
import { PageHeader, useSlug } from '@/layout/AppLayout'
import { useDepartments, usePlants } from './hooks'

function useOrgMutation(resource: 'plants' | 'departments') {
  const slug = useSlug()
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: [slug, resource] })
  return {
    create: useMutation({ mutationFn: (body: object) => api(tenantPath(slug, `${resource}/`), { method: 'POST', body }), onSuccess: done }),
    patch: useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => api(tenantPath(slug, `${resource}/${id}/`), { method: 'PATCH', body }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => api(tenantPath(slug, `${resource}/${id}/`), { method: 'DELETE' }), onSuccess: done }),
  }
}

function Errors({ errors }: { errors: (Error | null)[] }) {
  const e = errors.find(Boolean)
  return e ? <p role="alert" className="border-b border-border p-3 text-sm text-destructive">{e.message}</p> : null
}

function Plants({ canManage }: { canManage: boolean }) {
  const q = usePlants()
  const m = useOrgMutation('plants')
  const [name, setName] = useState('')
  return (
    <Card>
      <CardHeader>Plants</CardHeader>
      {canManage && (
        <form className="flex gap-2 border-b border-border p-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) m.create.mutate({ name }, { onSuccess: () => setName('') }) }}>
          <Input placeholder="New plant name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={m.create.isPending}>Add</Button>
        </form>
      )}
      <Errors errors={[m.create.error, m.patch.error, m.remove.error]} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data!.length === 0 ? <EmptyState title="No plants" /> : (
        <ul className="divide-y divide-border">
          {q.data!.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <span>{p.name} {!p.is_active && <Badge>inactive</Badge>}</span>
              {canManage && (
                <span className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => m.patch.mutate({ id: p.id, body: { is_active: !p.is_active } })}>{p.is_active ? 'Deactivate' : 'Activate'}</Button>
                  <Button size="sm" variant="outline" onClick={() => window.confirm(`Delete ${p.name}?`) && m.remove.mutate(p.id)}>Delete</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Departments({ canManage }: { canManage: boolean }) {
  const q = useDepartments()
  const plants = usePlants()
  const m = useOrgMutation('departments')
  const [name, setName] = useState('')
  const [plant, setPlant] = useState('')
  const plantName = (id: string | null) => plants.data?.find((p) => p.id === id)?.name
  return (
    <Card>
      <CardHeader>Departments</CardHeader>
      {canManage && (
        <form className="flex flex-wrap gap-2 border-b border-border p-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) m.create.mutate({ name, plant: plant || null }, { onSuccess: () => setName('') }) }}>
          <Input className="min-w-40 flex-1" placeholder="New department name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select className="w-44" aria-label="Plant" value={plant} onChange={(e) => setPlant(e.target.value)}>
            <option value="">Company-wide</option>
            {plants.data?.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button type="submit" disabled={m.create.isPending}>Add</Button>
        </form>
      )}
      <Errors errors={[m.create.error, m.patch.error, m.remove.error]} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data!.length === 0 ? <EmptyState title="No departments" /> : (
        <ul className="divide-y divide-border">
          {q.data!.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <span>{d.name} <span className="text-xs text-muted-foreground">{plantName(d.plant) ?? 'company-wide'}</span> {!d.is_active && <Badge>inactive</Badge>}</span>
              {canManage && (
                <span className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => m.patch.mutate({ id: d.id, body: { is_active: !d.is_active } })}>{d.is_active ? 'Deactivate' : 'Activate'}</Button>
                  <Button size="sm" variant="outline" onClick={() => window.confirm(`Delete ${d.name}?`) && m.remove.mutate(d.id)}>Delete</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function OrganizationPage() {
  const can = useCan()
  return (
    <>
      <PageHeader title="Plants & departments" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Plants canManage={can('plants.manage')} />
        <Departments canManage={can('departments.manage')} />
      </div>
    </>
  )
}
