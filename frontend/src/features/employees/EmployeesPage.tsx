import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, MailPlus, MoreHorizontal, Pencil, Plus, Search, Send, UserCheck, UserMinus, UserX, Users } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Avatar } from '@/components/kit/avatar'
import { Button } from '@/components/kit/button'
import { Card, PageTitle } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton, Notice } from '@/components/kit/feedback'
import { FormField, SelectInput, TextInput } from '@/components/kit/inputs'
import { Menu, MenuItem, MenuSeparator } from '@/components/kit/menu'
import { ConfirmDialog, Drawer } from '@/components/kit/overlay'
import { Chip } from '@/components/kit/pills'
import { Pager, Table, Td, Th } from '@/components/kit/table'
import { RequirePermission, useCan } from '@/features/auth/auth'
import { useDepartments, usePlants, useRoles } from '@/features/org/hooks'
import { api, ApiError, tenantPath } from '@/lib/api'
import type { Employee, Page } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSlug } from '@/layout/AppLayout'

const STATUS_TONE = { active: 'emerald', invited: 'amber', inactive: 'slate' } as const

/** A secret the server will never show again (temporary password, invitation link). */
type Secret = { title: string; label: string; value: string }

function SecretNotice({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  return (
    <div className="mb-6 animate-rise space-y-3 rounded-2xl bg-amber-50 p-5 ring-1 ring-inset ring-amber-200" role="status">
      <div>
        <p className="font-semibold text-amber-950">{secret.title}</p>
        <p className="mt-0.5 text-sm text-amber-900/90">{secret.label} It is shown <strong>only once</strong>. Copy it now.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-xl bg-white px-3.5 py-2.5 text-sm text-slate-800 ring-1 ring-amber-200">{secret.value}</code>
        <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(secret.value); toast.success('Copied') }}><Copy className="h-4 w-4" /> Copy</Button>
        <Button size="sm" onClick={onClose}>Done</Button>
      </div>
    </div>
  )
}

function OrgFields({ register, errors, id }: { register: ReturnType<typeof useForm<any>>['register']; errors: Record<string, any>; id: string }) {
  const roles = useRoles()
  const depts = useDepartments()
  const plants = usePlants()
  return (
    <>
      <FormField label="Role" htmlFor={`${id}-role`} error={errors.role?.message}>
        <SelectInput id={`${id}-role`} aria-invalid={!!errors.role} {...register('role')}>
          <option value="">Select a role…</option>
          {roles.data?.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </SelectInput>
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Department" htmlFor={`${id}-dept`} optional error={errors.department?.message}>
          <SelectInput id={`${id}-dept`} {...register('department')}>
            <option value="">None</option>
            {depts.data?.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </SelectInput>
        </FormField>
        <FormField label="Plant" htmlFor={`${id}-plant`} optional error={errors.plant?.message}>
          <SelectInput id={`${id}-plant`} {...register('plant')}>
            <option value="">None</option>
            {plants.data?.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectInput>
        </FormField>
      </div>
      <FormField label="Employee ID" htmlFor={`${id}-eid`} optional error={errors.employee_id?.message}><TextInput id={`${id}-eid`} {...register('employee_id')} /></FormField>
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


const generalError = (e: unknown) => (e instanceof Error && !(e instanceof ApiError && Object.keys(e.fieldErrors).length) ? e.message : '')

function FormDrawer({ title, description, formId, submitLabel, pending, onClose, children }: {
  title: string; description?: string; formId: string; submitLabel: string; pending: boolean; onClose: () => void; children: React.ReactNode
}) {
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={title} description={description}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form={formId} loading={pending}>{submitLabel}</Button></>}>
      {children}
    </Drawer>
  )
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
      onDone(); toast.success('Invitation sent')
    },
    onError: (e) => setServerErrors(e, form.setError),
  })
  const { errors } = form.formState
  return (
    <FormDrawer title="Invite by email" description="They get a link to set a password and join your workspace." formId="invite-form" submitLabel="Send invitation" pending={m.isPending} onClose={onDone}>
      <form id="invite-form" onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="First name" htmlFor="inv-first" error={errors.first_name?.message}><TextInput id="inv-first" {...form.register('first_name')} /></FormField>
          <FormField label="Last name" htmlFor="inv-last" optional error={errors.last_name?.message}><TextInput id="inv-last" {...form.register('last_name')} /></FormField>
        </div>
        <FormField label="Email" htmlFor="inv-email" error={errors.email?.message}><TextInput id="inv-email" type="email" {...form.register('email')} /></FormField>
        <OrgFields id="inv" register={form.register as never} errors={errors} />
        {generalError(m.error) && <Notice title="Couldn’t send">{generalError(m.error)}</Notice>}
      </form>
    </FormDrawer>
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
      onDone(); toast.success('Employee created')
    },
    onError: (e) => setServerErrors(e, form.setError),
  })
  const { errors } = form.formState
  return (
    <FormDrawer title="Add without email" description="For people without a work email. They sign in with your workspace name and a username." formId="username-form" submitLabel="Create employee" pending={m.isPending} onClose={onDone}>
      <form id="username-form" onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="First name" htmlFor="un-first" error={errors.first_name?.message}><TextInput id="un-first" {...form.register('first_name')} /></FormField>
          <FormField label="Last name" htmlFor="un-last" optional error={errors.last_name?.message}><TextInput id="un-last" {...form.register('last_name')} /></FormField>
        </div>
        <FormField label="Username" htmlFor="un-user" error={errors.username?.message}><TextInput id="un-user" autoComplete="off" {...form.register('username')} /></FormField>
        <FormField label="Mobile" htmlFor="un-phone" optional error={errors.phone?.message}><TextInput id="un-phone" {...form.register('phone')} /></FormField>
        <FormField label="Temporary password" htmlFor="un-pass" optional hint="Leave blank to generate one." error={errors.password?.message}><TextInput id="un-pass" type="password" autoComplete="new-password" {...form.register('password')} /></FormField>
        <OrgFields id="un" register={form.register as never} errors={errors} />
        {generalError(m.error) && <Notice title="Couldn’t create">{generalError(m.error)}</Notice>}
      </form>
    </FormDrawer>
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: [slug, 'employees'] }); onDone(); toast.success('Changes saved') },
    onError: (e) => setServerErrors(e, form.setError),
  })
  const { errors } = form.formState
  return (
    <FormDrawer title={`Edit ${employee.first_name} ${employee.last_name}`.trim()} formId="edit-form" submitLabel="Save changes" pending={m.isPending} onClose={onDone}>
      <form id="edit-form" onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="First name" htmlFor="ed-first" error={errors.first_name?.message}><TextInput id="ed-first" {...form.register('first_name')} /></FormField>
          <FormField label="Last name" htmlFor="ed-last" optional error={errors.last_name?.message}><TextInput id="ed-last" {...form.register('last_name')} /></FormField>
        </div>
        <FormField label="Mobile" htmlFor="ed-phone" optional error={errors.phone?.message}><TextInput id="ed-phone" {...form.register('phone')} /></FormField>
        <OrgFields id="ed" register={form.register as never} errors={errors} />
        {generalError(m.error) && <Notice title="Couldn’t save">{generalError(m.error)}</Notice>}
      </form>
    </FormDrawer>
  )
}

type Pending = { action: string; title: string; description: string; confirmLabel: string; danger?: boolean }

function RowActions({ e, onEdit, onSecret, onError }: { e: Employee; onEdit: () => void; onSecret: (s: Secret) => void; onError: (msg: string) => void }) {
  const slug = useSlug()
  const can = useCan()
  const qc = useQueryClient()
  const [pending, setPending] = useState<Pending | null>(null)
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
    onSettled: () => setPending(null),
  })
  const name = `${e.first_name} ${e.last_name}`.trim()
  const ask = (p: Pending) => setPending(p)
  const items = [
    can('users.update') && e.status !== 'invited' && <MenuItem key="edit" icon={<Pencil className="h-4 w-4" />} onSelect={onEdit}>Edit details</MenuItem>,
    can('users.update') && e.status === 'active' && !e.email && <MenuItem key="reset" icon={<KeyRound className="h-4 w-4" />} onSelect={() => ask({ action: 'reset-password', title: 'Reset password?', description: `Reset the password for ${name}? They will be signed out.`, confirmLabel: 'Reset password' })}>Reset password</MenuItem>,
    can('users.create') && e.status === 'invited' && <MenuItem key="resend" icon={<Send className="h-4 w-4" />} onSelect={() => act.mutate({ action: 'resend-invitation' })}>Resend invitation</MenuItem>,
    can('users.deactivate') && e.status === 'inactive' && <MenuItem key="react" icon={<UserCheck className="h-4 w-4" />} onSelect={() => act.mutate({ action: 'reactivate' })}>Reactivate</MenuItem>,
  ].filter(Boolean)
  const danger = [
    can('users.deactivate') && e.status === 'active' && <MenuItem key="deact" danger icon={<UserMinus className="h-4 w-4" />} onSelect={() => ask({ action: 'deactivate', title: 'Deactivate this person?', description: `Deactivate ${name}? They lose access immediately.`, confirmLabel: 'Deactivate', danger: true })}>Deactivate</MenuItem>,
    can('users.create') && e.status === 'invited' && <MenuItem key="revoke" danger icon={<UserX className="h-4 w-4" />} onSelect={() => ask({ action: 'revoke-invitation', title: 'Withdraw invitation?', description: `Withdraw the invitation for ${e.email}? The link will stop working.`, confirmLabel: 'Withdraw', danger: true })}>Revoke invitation</MenuItem>,
  ].filter(Boolean)
  if (!items.length && !danger.length) return null
  return (
    <div className="flex justify-end">
      <Menu trigger={<Button variant="ghost" size="icon" aria-label={`Actions for ${name}`} loading={act.isPending}><MoreHorizontal className="h-4 w-4" /></Button>}>
        {items}
        {items.length > 0 && danger.length > 0 && <MenuSeparator />}
        {danger}
      </Menu>
      <ConfirmDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)} title={pending?.title ?? ''} description={pending?.description ?? ''} confirmLabel={pending?.confirmLabel} danger={pending?.danger} loading={act.isPending}
        onConfirm={() => pending && act.mutate({ action: pending.action })} />
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
      <PageTitle
        title="Employees" subtitle="Everyone with access to this workspace."
        actions={can('users.create') && (
          <>
            <Button variant="secondary" onClick={() => { setForm('username'); setEditing(null) }}><Plus className="h-4 w-4" /> Add without email</Button>
            <Button onClick={() => { setForm('invite'); setEditing(null) }}><MailPlus className="h-4 w-4" /> Invite by email</Button>
          </>
        )}
      />
      {secret && <SecretNotice secret={secret} onClose={() => setSecret(null)} />}
      {actionError && <div className="mb-4"><Notice title="That didn’t work">{actionError}</Notice></div>}
      {form === 'invite' && <InviteForm onDone={() => setForm(null)} onSecret={setSecret} />}
      {form === 'username' && <UsernameForm onDone={() => setForm(null)} onSecret={setSecret} />}
      {editing && <EditForm key={editing.id} employee={editing} onDone={() => setEditing(null)} />}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="min-w-56 max-w-sm flex-1"><TextInput aria-label="Search employees" icon={<Search className="h-4 w-4" />} placeholder="Search name, email, username, ID…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} /></div>
          <div className="w-44"><SelectInput value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Status filter">
            <option value="">All statuses</option><option value="active">Active</option><option value="invited">Invited</option><option value="inactive">Inactive</option>
          </SelectInput></div>
        </div>
        {q.isLoading ? <ListSkeleton rows={6} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : q.data!.results.length === 0 ? (
          <EmptyPanel icon={<Users className="h-6 w-6" />} title="No employees match" hint="Try a different search or status." />
        ) : (
          <div className={cn('transition-opacity', q.isPlaceholderData && 'opacity-60')}>
            <Table>
              <thead><tr><Th>Name</Th><Th>Sign-in</Th><Th>Role</Th><Th>Department</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {q.data!.results.map((e) => {
                  const full = `${e.first_name} ${e.last_name}`.trim()
                  return (
                    <tr key={e.id} className="transition-colors hover:bg-slate-50/70">
                      <Td><span className="flex items-center gap-3"><Avatar name={full || e.username} /><span><span className="font-medium text-slate-900">{full}</span>{e.employee_id && <span className="ml-2 text-xs text-slate-400">#{e.employee_id}</span>}</span></span></Td>
                      <Td>{e.email ?? <span title="Signs in with workspace + username">@{e.username}</span>}</Td>
                      <Td>{e.role.name}</Td>
                      <Td>{e.department?.name ?? '—'}</Td>
                      <Td>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Chip tone={STATUS_TONE[e.status]} className="capitalize">{e.status}</Chip>
                          {e.must_change_password && <span className="text-xs text-slate-400">temp password</span>}
                          {e.status === 'invited' && e.invitation_expires_at && <span className="text-xs text-slate-400">expires {new Date(e.invitation_expires_at).toLocaleDateString()}</span>}
                        </span>
                      </Td>
                      <Td><RowActions e={e} onEdit={() => { setEditing(e); setForm(null); setActionError(null) }} onSecret={setSecret} onError={setActionError} /></Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            <div className="border-t border-slate-100"><Pager page={page} count={q.data!.count} noun="employee" onPage={setPage} /></div>
          </div>
        )}
      </Card>
    </>
  )
}

export function EmployeesPage() {
  return <RequirePermission permission="users.view"><Employees /></RequirePermission>
}
