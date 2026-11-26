import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form-controls'
import { Badge, Card, CardContent, CardHeader, EmptyState, ErrorState, Loading, Pager, Table, Td, Th } from '@/components/ui/misc'
import { RequirePermission, useCan } from '@/features/auth/auth'
import { useDepartments, usePlants, useRoles } from '@/features/org/hooks'
import { api, ApiError, tenantPath } from '@/lib/api'
import type { Employee, Page } from '@/lib/types'
import { PageHeader, useSlug } from '@/layout/AppLayout'
import { UserCog } from 'lucide-react'
import { Avatar } from '@/components/kit/avatar'
import { SECTION_TONE } from '@/components/kit/theme'

const STATUS_TONE = { active: 'green', invited: 'amber', inactive: 'gray' } as const

/** A secret the server will never show again (temporary password, invitation link). */
type Secret = { title: string; label: string; value: string }

function SecretNotice({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  return (
    <Card className="mb-6 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50" role="status">
      <CardContent className="space-y-2">
        <p className="font-semibold">{secret.title}</p>
        <p className="text-sm">{secret.label} It is shown <strong>only once</strong> — copy it now.</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 break-all rounded border border-border bg-card px-3 py-2 text-sm">{secret.value}</code>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(secret.value)}><Copy className="h-4 w-4" /> Copy</Button>
          <Button size="sm" onClick={onClose}>Done</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function OrgFields({ register, errors }: { register: ReturnType<typeof useForm<any>>['register']; errors: Record<string, any> }) {
  const roles = useRoles()
  const depts = useDepartments()
  const plants = usePlants()
  return (
    <>
      <Field label="Role" error={errors.role?.message}>
        <Select {...register('role')}>
          <option value="">Select a role…</option>
          {roles.data?.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>
      <Field label="Department" error={errors.department?.message}>
        <Select {...register('department')}>
          <option value="">—</option>
          {depts.data?.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </Field>
      <Field label="Plant" error={errors.plant?.message}>
        <Select {...register('plant')}>
          <option value="">—</option>
          {plants.data?.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Employee ID" error={errors.employee_id?.message}><Input {...register('employee_id')} /></Field>
    </>
  )
}

const orgShape = { role: z.string().min(1, 'Choose a role'), department: z.string(), plant: z.string(), employee_id: z.string() }
const orgBody = (v: { role: string; department: string; plant: string; employee_id: string }) => ({
  role: v.role, department: v.department || null, plant: v.plant || null, employee_id: v.employee_id,
})

function setServerErrors(e: unknown, setError: (k: any, m: { message: string }) => void) {
  if (e instanceof ApiError) for (const [k, message] of Object.entries(e.fieldErrors)) setError(k, { message })
}

const inviteSchema = z.object({
  first_name: z.string().min(1, 'Required'), last_name: z.string(), email: z.string().email('Enter a valid email'), ...orgShape,
})
type InviteValues = z.infer<typeof inviteSchema>

function InviteForm({ onDone, onSecret }: { onDone: () => void; onSecret: (s: Secret) => void }) {
  const slug = useSlug()
  const qc = useQueryClient()
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { first_name: '', last_name: '', email: '', role: '', department: '', plant: '', employee_id: '' },
  })
  const m = useMutation({
    mutationFn: (v: InviteValues) =>
      api<Employee>(tenantPath(slug, 'employees/invite/'), { method: 'POST', body: { ...orgBody(v), first_name: v.first_name, last_name: v.last_name, email: v.email } }),
    onSuccess: (e) => {
      qc.invalidateQueries({ queryKey: [slug, 'employees'] })
      // Only present when the server runs in DEBUG; production relies on the email.
      if (e.dev_invite_url) onSecret({ title: 'Invitation sent (dev mode)', label: 'Email is printed to the server console; the link is:', value: e.dev_invite_url })
      onDone()
    },
    onError: (e) => setServerErrors(e, form.setError),
  })
  const { errors } = form.formState
  return (
    <Card className="mb-6">
      <CardHeader>Invite by email</CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.first_name?.message}><Input {...form.register('first_name')} /></Field>
          <Field label="Last name" error={errors.last_name?.message}><Input {...form.register('last_name')} /></Field>
          <Field label="Email" error={errors.email?.message}><Input type="email" {...form.register('email')} /></Field>
          <OrgFields register={form.register as never} errors={errors} />
          {m.error && !(m.error instanceof ApiError && Object.keys(m.error.fieldErrors).length) && <p role="alert" className="text-sm text-destructive sm:col-span-2">{m.error.message}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={m.isPending}>{m.isPending ? 'Sending…' : 'Send invitation'}</Button>
            <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

const usernameSchema = z.object({
  first_name: z.string().min(1, 'Required'), last_name: z.string(), phone: z.string(),
  username: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,59}$/, '3-60 lowercase letters, digits, dots, hyphens or underscores'),
  password: z.string(), ...orgShape,
})
type UsernameValues = z.infer<typeof usernameSchema>

function UsernameForm({ onDone, onSecret }: { onDone: () => void; onSecret: (s: Secret) => void }) {
  const slug = useSlug()
  const qc = useQueryClient()
  const form = useForm<UsernameValues>({
    resolver: zodResolver(usernameSchema),
    defaultValues: { first_name: '', last_name: '', phone: '', username: '', password: '', role: '', department: '', plant: '', employee_id: '' },
  })
  const m = useMutation({
    mutationFn: (v: UsernameValues) =>
      api<Employee>(tenantPath(slug, 'employees/create-username/'), {
        method: 'POST',
        body: { ...orgBody(v), first_name: v.first_name, last_name: v.last_name, phone: v.phone, username: v.username, ...(v.password ? { password: v.password } : {}) },
      }),
    onSuccess: (e) => {
      qc.invalidateQueries({ queryKey: [slug, 'employees'] })
      if (e.temporary_password) {
        onSecret({ title: `Temporary password for ${e.username}`, label: `They sign in with workspace “${slug}”, username “${e.username}” and must change it at first login.`, value: e.temporary_password })
      }
      onDone()
    },
    onError: (e) => setServerErrors(e, form.setError),
  })
  const { errors } = form.formState
  return (
    <Card className="mb-6">
      <CardHeader>Add employee without email</CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.first_name?.message}><Input {...form.register('first_name')} /></Field>
          <Field label="Last name" error={errors.last_name?.message}><Input {...form.register('last_name')} /></Field>
          <Field label="Username" error={errors.username?.message}><Input autoComplete="off" {...form.register('username')} /></Field>
          <Field label="Mobile (optional)" error={errors.phone?.message}><Input {...form.register('phone')} /></Field>
          <Field label="Temporary password (leave blank to generate)" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...form.register('password')} /></Field>
          <OrgFields register={form.register as never} errors={errors} />
          {m.error && !(m.error instanceof ApiError && Object.keys(m.error.fieldErrors).length) && <p role="alert" className="text-sm text-destructive sm:col-span-2">{m.error.message}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={m.isPending}>{m.isPending ? 'Creating…' : 'Create employee'}</Button>
            <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

const editSchema = z.object({ first_name: z.string().min(1, 'Required'), last_name: z.string(), phone: z.string(), ...orgShape })
type EditValues = z.infer<typeof editSchema>

function EditForm({ employee, onDone }: { employee: Employee; onDone: () => void }) {
  const slug = useSlug()
  const qc = useQueryClient()
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      first_name: employee.first_name, last_name: employee.last_name, phone: employee.phone, role: employee.role.id,
      department: employee.department?.id ?? '', plant: employee.plant?.id ?? '', employee_id: employee.employee_id,
    },
  })
  const m = useMutation({
    mutationFn: (v: EditValues) =>
      api<Employee>(tenantPath(slug, `employees/${employee.id}/`), {
        method: 'PATCH', body: { ...orgBody(v), first_name: v.first_name, last_name: v.last_name, phone: v.phone },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [slug, 'employees'] }); onDone() },
    onError: (e) => setServerErrors(e, form.setError),
  })
  const { errors } = form.formState
  return (
    <Card className="mb-6">
      <CardHeader>Edit {employee.first_name} {employee.last_name}</CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.first_name?.message}><Input {...form.register('first_name')} /></Field>
          <Field label="Last name" error={errors.last_name?.message}><Input {...form.register('last_name')} /></Field>
          <Field label="Mobile" error={errors.phone?.message}><Input {...form.register('phone')} /></Field>
          <OrgFields register={form.register as never} errors={errors} />
          {m.error && !(m.error instanceof ApiError && Object.keys(m.error.fieldErrors).length) && <p role="alert" className="text-sm text-destructive sm:col-span-2">{m.error.message}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={m.isPending}>{m.isPending ? 'Saving…' : 'Save changes'}</Button>
            <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function RowActions({ e, onEdit, onSecret, onError }: { e: Employee; onEdit: () => void; onSecret: (s: Secret) => void; onError: (msg: string) => void }) {
  const slug = useSlug()
  const can = useCan()
  const qc = useQueryClient()
  const act = useMutation({
    mutationFn: ({ action }: { action: string }) => api<Employee & { temporary_password?: string }>(tenantPath(slug, `employees/${e.id}/${action}/`), { method: 'POST' }),
    onSuccess: (r, { action }) => {
      qc.invalidateQueries({ queryKey: [slug, 'employees'] })
      if (action === 'reset-password' && r.temporary_password) {
        onSecret({ title: `New temporary password for ${e.username}`, label: 'Their sessions were signed out and they must change it at next login.', value: r.temporary_password })
      }
      if (action === 'resend-invitation' && r.dev_invite_url) onSecret({ title: 'Invitation re-sent (dev mode)', label: 'The previous link no longer works. New link:', value: r.dev_invite_url })
    },
    onError: (err) => onError(err.message),
  })
  const run = (action: string, confirm?: string) => { if (!confirm || window.confirm(confirm)) act.mutate({ action }) }
  const name = `${e.first_name} ${e.last_name}`.trim()
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {can('users.update') && e.status !== 'invited' && <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>}
      {can('users.update') && e.status === 'active' && !e.email && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run('reset-password', `Reset the password for ${name}? They will be signed out.`)}>Reset password</Button>}
      {can('users.deactivate') && e.status === 'active' && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run('deactivate', `Deactivate ${name}? They lose access immediately.`)}>Deactivate</Button>}
      {can('users.deactivate') && e.status === 'inactive' && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run('reactivate')}>Reactivate</Button>}
      {can('users.create') && e.status === 'invited' && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run('resend-invitation')}>Resend</Button>}
      {can('users.create') && e.status === 'invited' && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run('revoke-invitation', `Withdraw the invitation for ${e.email}?`)}>Revoke</Button>}
    </div>
  )
}

function Employees() {
  const slug = useSlug()
  const can = useCan()
  const [form, setForm] = useState<'invite' | 'username' | null>(null)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [secret, setSecret] = useState<Secret | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const q = useQuery({
    queryKey: [slug, 'employees', search, status, page],
    queryFn: () => api<Page<Employee>>(tenantPath(slug, `employees/?page=${page}&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ''}`)),
    placeholderData: (prev) => prev,
  })
  return (
    <>
      <PageHeader
        icon={UserCog} tone={SECTION_TONE.employees} subtitle="Invite people and decide what they can do"
        title="Employees"
        actions={can('users.create') && (
          <div className="flex gap-2">
            <Button onClick={() => { setForm('invite'); setEditing(null) }}>Invite by email</Button>
            <Button variant="outline" onClick={() => { setForm('username'); setEditing(null) }}>Add without email</Button>
          </div>
        )}
      />
      {secret && <SecretNotice secret={secret} onClose={() => setSecret(null)} />}
      {actionError && <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-red-50 p-3 text-sm text-destructive">{actionError}</p>}
      {form === 'invite' && <InviteForm onDone={() => setForm(null)} onSecret={setSecret} />}
      {form === 'username' && <UsernameForm onDone={() => setForm(null)} onSecret={setSecret} />}
      {editing && <EditForm key={editing.id} employee={editing} onDone={() => setEditing(null)} />}
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <Input placeholder="Search name, email, username, employee ID…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="max-w-sm" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="w-40" aria-label="Status filter">
            <option value="">All statuses</option><option value="active">Active</option><option value="invited">Invited</option><option value="inactive">Inactive</option>
          </Select>
        </div>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data!.results.length === 0 ? (
          <EmptyState title="No employees match" />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Name</Th><Th>Sign-in</Th><Th>Role</Th><Th>Department</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {q.data!.results.map((e) => (
                  <tr key={e.id}>
                    <Td><span className="flex items-center gap-3"><Avatar name={`${e.first_name} ${e.last_name}`.trim() || e.email || e.username} size="md" /><span className="font-medium text-slate-900">{e.first_name} {e.last_name}{e.employee_id && <span className="ml-2 text-xs font-normal text-slate-400">#{e.employee_id}</span>}</span></span></Td>
                    <Td>{e.email ?? <span title="Signs in with workspace + username">@{e.username}</span>}</Td>
                    <Td>{e.role.name}</Td>
                    <Td>{e.department?.name ?? '—'}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
                      {e.must_change_password && <span className="ml-2 text-xs text-muted-foreground">temp password</span>}
                      {e.status === 'invited' && e.invitation_expires_at && <span className="ml-2 text-xs text-muted-foreground">expires {new Date(e.invitation_expires_at).toLocaleDateString()}</span>}
                    </Td>
                    <Td><RowActions e={e} onEdit={() => { setEditing(e); setForm(null); setActionError(null) }} onSecret={setSecret} onError={setActionError} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={page} count={q.data!.count} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  )
}

export function EmployeesPage() {
  return <RequirePermission permission="users.view"><Employees /></RequirePermission>
}
