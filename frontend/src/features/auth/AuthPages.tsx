import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { ClipboardList, ScrollText, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form-controls'
import { api, ApiError } from '@/lib/api'
import type { Me } from '@/lib/types'
import { ME_KEY, useMe } from './auth'

const PERKS = [
  { icon: ClipboardList, title: 'Every complaint, one place', text: 'Log, assign and track problems from first report to closure.', tone: 'bg-rose-400/30' },
  { icon: ShieldCheck, title: 'Your data stays yours', text: 'Separate workspaces and role-based access for every company.', tone: 'bg-emerald-400/30' },
  { icon: ScrollText, title: 'A trail you can trust', text: 'A permanent record of who changed what and when.', tone: 'bg-amber-400/30' },
]

/** Split layout: brand panel on the left (desktop), the form on the right. */
function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 animate-[float_10s_ease-in-out_infinite] rounded-full bg-white/15 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-28 -left-10 h-80 w-80 animate-[float_12s_ease-in-out_infinite_reverse] rounded-full bg-cyan-300/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute inset-0 opacity-[0.1] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden />
        <Link to="/" className="relative flex items-center gap-2.5 self-start">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30 backdrop-blur"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
          <span className="text-lg font-semibold tracking-tight">QMS Platform</span>
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">Solve quality problems for good.</h2>
          <p className="mt-3 text-[15px] text-indigo-100">From the first customer complaint to a closed, documented fix, with your whole team in one secure workspace.</p>
          <ul className="mt-10 space-y-5">
            {PERKS.map(({ icon: Icon, title: t, text, tone }) => (
              <li key={t} className="flex items-start gap-4">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/25 backdrop-blur ${tone}`}><Icon className="h-5 w-5" aria-hidden /></span>
                <span><span className="block font-medium">{t}</span><span className="block text-sm text-indigo-100/90">{text}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-indigo-200/80">Built for manufacturers and their OEM customers.</p>
      </aside>
      <main className="bg-app flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md animate-rise">
          <Link to="/" className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
            <span className="font-semibold text-slate-900">QMS Platform</span>
          </Link>
          <div className="rounded-3xl border border-slate-200/70 bg-white p-7 shadow-[var(--shadow-pop)] sm:p-9">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            <div className="mt-6 space-y-5">{children}</div>
          </div>
        </div>
      </main>
    </div>
  )
}

const emailLogin = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Required') })
const usernameLogin = z.object({
  workspace: z.string().min(1, 'Required'), username: z.string().min(1, 'Required'), password: z.string().min(1, 'Required'),
})

/** Email login, or workspace + username (employees created by an admin without an email). */
export function LoginPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const { data: me } = useMe()
  const [mode, setMode] = useState<'email' | 'username'>('email')
  const m = useMutation({
    mutationFn: (v: Record<string, string>) => api<Me>('/api/v1/auth/login/', { method: 'POST', body: v }),
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user)
      nav('/', { replace: true })
    },
  })
  if (me) return <Navigate to="/" replace />
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your workspace">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100/80 p-1 text-sm ring-1 ring-slate-200/60" role="tablist">
        {(['email', 'username'] as const).map((k) => (
          <button
            key={k} type="button" role="tab" aria-selected={mode === k}
            onClick={() => { setMode(k); m.reset() }}
            className={`rounded-lg px-3 py-2 font-medium transition ${mode === k ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/70' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {k === 'email' ? 'Email' : 'Username'}
          </button>
        ))}
      </div>
      {mode === 'email' ? <EmailForm onSubmit={(v) => m.mutate(v)} /> : <UsernameForm onSubmit={(v) => m.mutate(v)} />}
      {m.error && <p role="alert" className="text-sm text-destructive">{m.error.message}</p>}
      <p className="text-sm text-muted-foreground">New here? <Link className="font-medium text-indigo-600 hover:text-indigo-800" to="/register">Register your company</Link></p>
    </AuthShell>
  )
}

function EmailForm({ onSubmit }: { onSubmit: (v: z.infer<typeof emailLogin>) => void }) {
  const form = useForm({ resolver: zodResolver(emailLogin), defaultValues: { email: '', password: '' } })
  const { errors } = form.formState
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...form.register('email')} /></Field>
      <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...form.register('password')} /></Field>
      <Button type="submit" className="w-full">Sign in</Button>
    </form>
  )
}

function UsernameForm({ onSubmit }: { onSubmit: (v: z.infer<typeof usernameLogin>) => void }) {
  const form = useForm({ resolver: zodResolver(usernameLogin), defaultValues: { workspace: '', username: '', password: '' } })
  const { errors } = form.formState
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Field label="Workspace" error={errors.workspace?.message}><Input placeholder="your-company" autoComplete="organization" {...form.register('workspace')} /></Field>
      <Field label="Username" error={errors.username?.message}><Input autoComplete="username" {...form.register('username')} /></Field>
      <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...form.register('password')} /></Field>
      <Button type="submit" className="w-full">Sign in</Button>
    </form>
  )
}

const registerSchema = z.object({
  company_name: z.string().min(2, 'Required'),
  company_slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, '3-40 lowercase letters, digits or hyphens'),
  first_name: z.string().min(1, 'Required'),
  last_name: z.string(),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
})
type RegisterValues = z.infer<typeof registerSchema>

export function RegisterPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { company_name: '', company_slug: '', first_name: '', last_name: '', email: '', password: '' },
  })
  const m = useMutation({
    mutationFn: (v: RegisterValues) => api<Me>('/api/v1/auth/register/', { method: 'POST', body: v }),
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user)
      nav(`/${user.memberships[0].company.slug}/dashboard`, { replace: true })
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        for (const [k, msg] of Object.entries(e.fieldErrors)) form.setError(k as keyof RegisterValues, { message: msg })
      }
    },
  })
  const { errors } = form.formState
  const r = form.register
  return (
    <AuthShell title="Create your workspace" subtitle="Set up your company in a minute">
      <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4">
        <Field label="Company name" error={errors.company_name?.message}><Input {...r('company_name')} /></Field>
        <Field label="Workspace URL name" error={errors.company_slug?.message}><Input placeholder="acme-machining" {...r('company_slug')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" error={errors.first_name?.message}><Input {...r('first_name')} /></Field>
          <Field label="Last name" error={errors.last_name?.message}><Input {...r('last_name')} /></Field>
        </div>
        <Field label="Work email" error={errors.email?.message}><Input type="email" autoComplete="email" {...r('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...r('password')} /></Field>
        {m.error && !(m.error instanceof ApiError && Object.keys(m.error.fieldErrors).length) && (
          <p role="alert" className="text-sm text-destructive">{m.error.message}</p>
        )}
        <Button type="submit" className="w-full" disabled={m.isPending}>{m.isPending ? 'Creating…' : 'Create company'}</Button>
      </form>
      <p className="text-sm text-muted-foreground">Already registered? <Link className="font-medium text-indigo-600 hover:text-indigo-800" to="/login">Sign in</Link></p>
    </AuthShell>
  )
}

const changeSchema = z
  .object({ current_password: z.string().min(1, 'Required'), new_password: z.string().min(8, 'At least 8 characters'), confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })
type ChangeValues = z.infer<typeof changeSchema>

/** Forced after an admin-issued temporary password; also reachable voluntarily from the sidebar. */
export function ChangePasswordPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const { data: me } = useMe()
  const form = useForm<ChangeValues>({ resolver: zodResolver(changeSchema), defaultValues: { current_password: '', new_password: '', confirm: '' } })
  const m = useMutation({
    mutationFn: (v: ChangeValues) =>
      api<Me>('/api/v1/auth/change-password/', { method: 'POST', body: { current_password: v.current_password, new_password: v.new_password } }),
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user)
      nav('/', { replace: true })
    },
    onError: (e) => {
      if (e instanceof ApiError) for (const [k, msg] of Object.entries(e.fieldErrors)) form.setError(k as keyof ChangeValues, { message: msg })
    },
  })
  const { errors } = form.formState
  const forced = me?.must_change_password
  return (
    <AuthShell title={forced ? 'Choose a new password' : 'Change password'}>
      {forced && <p className="text-sm text-muted-foreground">Your administrator gave you a temporary password. Replace it to continue.</p>}
      <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4">
        <Field label="Current password" error={errors.current_password?.message}><Input type="password" autoComplete="current-password" {...form.register('current_password')} /></Field>
        <Field label="New password" error={errors.new_password?.message}><Input type="password" autoComplete="new-password" {...form.register('new_password')} /></Field>
        <Field label="Confirm new password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...form.register('confirm')} /></Field>
        <Button type="submit" className="w-full" disabled={m.isPending}>{m.isPending ? 'Saving…' : 'Change password'}</Button>
        {!forced && <Button type="button" variant="outline" className="w-full" onClick={() => nav(-1)}>Cancel</Button>}
      </form>
    </AuthShell>
  )
}

type InvitePreview = { company_name: string; email: string; first_name: string; requires_password: boolean }
const inviteSchema = z
  .object({ password: z.string(), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })

/** Landing page for the link in an invitation email. */
export function AcceptInvitePage() {
  const token = new URLSearchParams(useLocation().search).get('token') ?? ''
  const qc = useQueryClient()
  const nav = useNavigate()
  const { data: me } = useMe()
  const preview = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: () => api<InvitePreview>(`/api/v1/auth/invitations/preview/?token=${encodeURIComponent(token)}`),
    retry: false,
  })
  const form = useForm({ resolver: zodResolver(inviteSchema), defaultValues: { password: '', confirm: '' } })
  const accept = useMutation({
    mutationFn: (password: string) => api<Me>('/api/v1/auth/invitations/accept/', { method: 'POST', body: { token, password } }),
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user)
      nav('/', { replace: true })
    },
    onError: (e) => {
      if (e instanceof ApiError) for (const [k, msg] of Object.entries(e.fieldErrors)) if (k === 'password') form.setError('password', { message: msg })
    },
  })
  if (preview.isLoading) return <AuthShell title="Invitation"><p className="text-sm">Checking your invitation…</p></AuthShell>
  if (preview.isError || !preview.data) {
    return (
      <AuthShell title="Invitation unavailable">
        <p role="alert" className="text-sm text-destructive">This invitation is invalid, expired or was withdrawn. Ask your administrator to send a new one.</p>
        <Link className="text-sm font-medium text-indigo-600 hover:text-indigo-800" to="/login">Go to sign in</Link>
      </AuthShell>
    )
  }
  const inv = preview.data
  const { errors } = form.formState
  return (
    <AuthShell title={`Join ${inv.company_name}`}>
      <p className="text-sm text-muted-foreground">Invitation for <strong>{inv.email}</strong>.</p>
      {inv.requires_password ? (
        <form onSubmit={form.handleSubmit((v) => accept.mutate(v.password))} className="space-y-4">
          <Field label="Choose a password" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...form.register('password')} /></Field>
          <Field label="Confirm password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...form.register('confirm')} /></Field>
          {accept.error && !errors.password && <p role="alert" className="text-sm text-destructive">{accept.error.message}</p>}
          <Button type="submit" className="w-full" disabled={accept.isPending}>{accept.isPending ? 'Activating…' : 'Activate account'}</Button>
        </form>
      ) : me?.email?.toLowerCase() === inv.email.toLowerCase() ? (
        <div className="space-y-4">
          <p className="text-sm">You already have an account. Accept to add this company to it.</p>
          {accept.error && <p role="alert" className="text-sm text-destructive">{accept.error.message}</p>}
          <Button className="w-full" disabled={accept.isPending} onClick={() => accept.mutate('')}>Accept invitation</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">This email already has an account. Sign in as <strong>{inv.email}</strong>, then open this link again.</p>
          <Button asChild className="w-full"><Link to="/login">Sign in</Link></Button>
        </div>
      )}
    </AuthShell>
  )
}
