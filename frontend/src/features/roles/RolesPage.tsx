import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/kit/button'
import { Card, CardHeading, PageTitle } from '@/components/kit/card'
import { ErrorPanel, ListSkeleton, Notice } from '@/components/kit/feedback'
import { FormField, SelectInput, TextInput } from '@/components/kit/inputs'
import { ConfirmDialog } from '@/components/kit/overlay'
import { Chip } from '@/components/kit/pills'
import { RequirePermission } from '@/features/auth/auth'
import { useRoles } from '@/features/org/hooks'
import { api, tenantPath } from '@/lib/api'
import { SCOPES, type Grant, type PermissionDef, type Role, type Scope } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSlug } from '@/layout/AppLayout'

const NEW = 'new'

function RoleEditor({ role, catalog, onSaved, onDeleted }: { role: Role | null; catalog: PermissionDef[]; onSaved: (r: Role) => void; onDeleted: () => void }) {
  const slug = useSlug()
  const qc = useQueryClient()
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [grants, setGrants] = useState<Record<string, Scope>>(() => Object.fromEntries((role?.permissions ?? []).map((g) => [g.code, g.scope])))
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toList = (): Grant[] => Object.entries(grants).map(([code, scope]) => ({ code, scope }))
  const refresh = () => { qc.invalidateQueries({ queryKey: [slug, 'roles'] }); qc.invalidateQueries({ queryKey: ['me'] }) }
  const save = useMutation({
    mutationFn: () =>
      role
        ? api<Role>(tenantPath(slug, `roles/${role.id}/`), { method: 'PATCH', body: { name, description, permissions: toList() } })
        : api<Role>(tenantPath(slug, 'roles/'), { method: 'POST', body: { name, description, permissions: toList() } }),
    onSuccess: (r) => { refresh(); setSaved(true); onSaved(r); toast.success('Role saved') },
  })
  const del = useMutation({
    mutationFn: () => api(tenantPath(slug, `roles/${role!.id}/`), { method: 'DELETE' }),
    onSuccess: () => { refresh(); setConfirmDelete(false); onDeleted(); toast.success('Role deleted') },
    onError: () => setConfirmDelete(false),
  })

  const modules = [...new Set(catalog.map((p) => p.module))]
  const toggle = (code: string, on: boolean) => {
    setSaved(false)
    setGrants((g) => { const n = { ...g }; if (on) n[code] = 'all'; else delete n[code]; return n })
  }
  const error = save.error ?? del.error
  return (
    <Card className="overflow-hidden">
      <CardHeading title={role ? role.name : 'New role'} hint="Choose what people with this role can do." action={role?.is_system ? <Chip tone="indigo">System role</Chip> : undefined} />
      <div className="space-y-6 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" htmlFor="role-name"><TextInput id="role-name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} /></FormField>
          <FormField label="Description" htmlFor="role-desc" optional><TextInput id="role-desc" value={description} onChange={(e) => { setDescription(e.target.value); setSaved(false) }} /></FormField>
        </div>
        {modules.map((mod) => (
          <fieldset key={mod}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{mod.replace(/_/g, ' ')}</legend>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-200">
              {catalog.filter((p) => p.module === mod).map((p) => (
                <div key={p.code} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-slate-50/70">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={p.code in grants} onChange={(e) => toggle(p.code, e.target.checked)} />
                    <span className="text-slate-800">{p.description}</span>
                    <code className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 md:inline">{p.code}</code>
                  </label>
                  {p.scopable && p.code in grants && (
                    <div className="w-48"><SelectInput aria-label={`Scope for ${p.code}`} className="!h-9 text-xs" value={grants[p.code]} onChange={(e) => { setSaved(false); setGrants((g) => ({ ...g, [p.code]: e.target.value as Scope })) }}>
                      {SCOPES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All company records' : s === 'department' ? 'Own department only' : 'Assigned to them only'}</option>)}
                    </SelectInput></div>
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        ))}
        {error && <Notice title="Couldn’t save">{error.message}</Notice>}
        {saved && <Notice tone="success">Saved. Changes apply immediately.</Notice>}
        <div className="flex gap-2">
          <Button disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>{role ? 'Save role' : 'Create role'}</Button>
          {role && !role.is_system && <Button variant="danger-soft" onClick={() => setConfirmDelete(true)}>Delete</Button>}
        </div>
      </div>
      {role && <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this role?" description={`The role “${role.name}” will be removed. Roles that people still hold can’t be deleted.`} confirmLabel="Delete" danger loading={del.isPending} onConfirm={() => del.mutate()} />}
    </Card>
  )
}

function Roles() {
  const slug = useSlug()
  const roles = useRoles()
  const catalog = useQuery({ queryKey: [slug, 'permission-catalog'], queryFn: () => api<PermissionDef[]>(tenantPath(slug, 'permissions/')) })
  const [selected, setSelected] = useState<string>('')
  if (roles.isLoading || catalog.isLoading) return <><PageTitle title="Roles & permissions" /><Card><ListSkeleton rows={4} /></Card></>
  if (roles.isError || catalog.isError) return <Card><ErrorPanel error={roles.error ?? catalog.error} onRetry={() => { roles.refetch(); catalog.refetch() }} /></Card>
  const list = roles.data!
  const current = selected === NEW ? null : list.find((r) => r.id === selected) ?? list[0]
  return (
    <>
      <PageTitle title="Roles & permissions" subtitle="Control exactly what each kind of employee can see and do." actions={<Button onClick={() => setSelected(NEW)}><Plus className="h-4 w-4" /> New role</Button>} />
      <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden p-1.5">
          <ul className="space-y-0.5">
            {list.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setSelected(r.id)} aria-current={current?.id === r.id} className={cn('w-full rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60', current?.id === r.id ? 'bg-indigo-50 font-semibold text-indigo-700 ring-1 ring-indigo-100' : 'font-medium text-slate-700 hover:bg-slate-100/80')}>
                  {r.name}
                  <span className={cn('block text-xs font-normal', current?.id === r.id ? 'text-indigo-500' : 'text-slate-500')}>{r.member_count} {r.member_count === 1 ? 'employee' : 'employees'}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <RoleEditor
          key={current?.id ?? NEW} role={current} catalog={catalog.data!}
          onSaved={(r) => setSelected(r.id)} onDeleted={() => setSelected('')}
        />
      </div>
    </>
  )
}

export function RolesPage() {
  return <RequirePermission permission="roles.manage"><Roles /></RequirePermission>
}
