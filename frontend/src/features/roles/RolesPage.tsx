import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form-controls'
import { Badge, Card, CardContent, CardHeader, ErrorState, Loading } from '@/components/ui/misc'
import { RequirePermission } from '@/features/auth/auth'
import { useRoles } from '@/features/org/hooks'
import { api, tenantPath } from '@/lib/api'
import { SCOPES, type Grant, type PermissionDef, type Role, type Scope } from '@/lib/types'
import { PageHeader, useSlug } from '@/layout/AppLayout'
import { ShieldCheck, Users } from 'lucide-react'
import { Avatar } from '@/components/kit/avatar'
import { SECTION_TONE } from '@/components/kit/theme'

const NEW = 'new'

function RoleEditor({ role, catalog, onSaved, onDeleted }: { role: Role | null; catalog: PermissionDef[]; onSaved: (r: Role) => void; onDeleted: () => void }) {
  const slug = useSlug()
  const qc = useQueryClient()
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [grants, setGrants] = useState<Record<string, Scope>>(() => Object.fromEntries((role?.permissions ?? []).map((g) => [g.code, g.scope])))
  const [saved, setSaved] = useState(false)

  const toList = (): Grant[] => Object.entries(grants).map(([code, scope]) => ({ code, scope }))
  const refresh = () => { qc.invalidateQueries({ queryKey: [slug, 'roles'] }); qc.invalidateQueries({ queryKey: ['me'] }) }
  const save = useMutation({
    mutationFn: () =>
      role
        ? api<Role>(tenantPath(slug, `roles/${role.id}/`), { method: 'PATCH', body: { name, description, permissions: toList() } })
        : api<Role>(tenantPath(slug, 'roles/'), { method: 'POST', body: { name, description, permissions: toList() } }),
    onSuccess: (r) => { refresh(); setSaved(true); onSaved(r) },
  })
  const del = useMutation({
    mutationFn: () => api(tenantPath(slug, `roles/${role!.id}/`), { method: 'DELETE' }),
    onSuccess: () => { refresh(); onDeleted() },
  })

  const modules = [...new Set(catalog.map((p) => p.module))]
  const toggle = (code: string, on: boolean) => {
    setSaved(false)
    setGrants((g) => { const n = { ...g }; if (on) n[code] = 'all'; else delete n[code]; return n })
  }
  const error = save.error ?? del.error
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span>{role ? role.name : 'New role'}</span>
        {role?.is_system && <Badge tone="blue">system role</Badge>}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} /></Field>
          <Field label="Description"><Input value={description} onChange={(e) => { setDescription(e.target.value); setSaved(false) }} /></Field>
        </div>
        {modules.map((mod) => (
          <fieldset key={mod}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-600">{mod.replace(/_/g, ' ')}</legend>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
              {catalog.filter((p) => p.module === mod).map((p) => (
                <div key={p.code} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <label className="flex flex-1 items-center gap-2">
                    <input type="checkbox" checked={p.code in grants} onChange={(e) => toggle(p.code, e.target.checked)} />
                    <span>{p.description}</span>
                    <code className="text-xs text-muted-foreground">{p.code}</code>
                  </label>
                  {p.scopable && p.code in grants && (
                    <Select aria-label={`Scope for ${p.code}`} className="h-8 w-44 text-xs" value={grants[p.code]} onChange={(e) => { setSaved(false); setGrants((g) => ({ ...g, [p.code]: e.target.value as Scope })) }}>
                      {SCOPES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All company records' : s === 'department' ? 'Own department only' : 'Assigned to them only'}</option>)}
                    </Select>
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        ))}
        {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        {saved && <p role="status" className="text-sm text-green-700">Saved. Changes apply immediately.</p>}
        <div className="flex gap-2">
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : role ? 'Save role' : 'Create role'}</Button>
          {role && !role.is_system && (
            <Button variant="destructive" disabled={del.isPending} onClick={() => window.confirm(`Delete the role “${role.name}”?`) && del.mutate()}>Delete</Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Roles() {
  const slug = useSlug()
  const roles = useRoles()
  const catalog = useQuery({ queryKey: [slug, 'permission-catalog'], queryFn: () => api<PermissionDef[]>(tenantPath(slug, 'permissions/')) })
  const [selected, setSelected] = useState<string>('')
  if (roles.isLoading || catalog.isLoading) return <Loading />
  if (roles.isError || catalog.isError) return <ErrorState error={roles.error ?? catalog.error} onRetry={() => { roles.refetch(); catalog.refetch() }} />
  const list = roles.data!
  const current = selected === NEW ? null : list.find((r) => r.id === selected) ?? list[0]
  return (
    <>
      <PageHeader icon={ShieldCheck} tone={SECTION_TONE.roles} title="Roles & permissions" subtitle="Control exactly what each kind of employee can see and do" actions={<Button onClick={() => setSelected(NEW)}>New role</Button>} />
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <Card className="h-fit">
          <ul className="divide-y divide-slate-100">
            {list.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setSelected(r.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-violet-50/60 ${current?.id === r.id ? 'bg-violet-50 shadow-[inset_3px_0_0_0_theme(colors.violet.500)]' : ''}`}>
                  <Avatar name={r.name} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{r.name}</span>
                    <span className="flex items-center gap-1 text-xs font-normal text-slate-500"><Users className="h-3 w-3" />{r.member_count} {r.member_count === 1 ? 'employee' : 'employees'}</span>
                  </span>
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
