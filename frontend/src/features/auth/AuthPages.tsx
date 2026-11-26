import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ShieldCheck } from 'lucide-react'
import { Button, buttonClass } from '@/components/kit/button'
import { Notice } from '@/components/kit/feedback'
import { FormField, TextInput } from '@/components/kit/inputs'
import { PageTransition } from '@/components/kit/motion'
import { Segmented } from '@/components/kit/segmented'
import { api, ApiError } from '@/lib/api'
import type { Me } from '@/lib/types'
import { AuthVisual } from './AuthVisual'
import { ME_KEY, useMe } from './auth'

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <AuthVisual />
      <main className="bg-app flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md"><PageTransition>
          <div className="rounded-3xl border border-slate-200/70 bg-white p-8 shadow-[var(--shadow-card)] sm:p-9">
            <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
              <span className="text-[15px] font-semibold text-slate-900">QMS Platform</span>
            </Link>
            <h1 className="text-[32px] font-semibold tracking-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-2 text-[15px] text-slate-500">{subtitle}</p>}
            <div className="mt-8 space-y-6">{children}</div>
          </div>
        </PageTransition></div>
      </main>
    </div>
  )
}

const FooterLink = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link className="font-medium text-indigo-600 hover:text-indigo-800" to={to}>{children}</Link>
)
const errorText = (e: unknown) => (e instanceof ApiError && Object.keys(e.fieldErrors).length ? null : e instanceof Error ? e.message : null)

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
    <AuthShell title="Welcome back" subtitle="Sign in to your workspace.">
      <Segmented label="Sign-in method" value={mode} onChange={(k) => { setMode(k); m.reset() }} options={[{ value: 'email', label: 'Email' }, { value: 'username', label: 'Username' }]} />
      {mode === 'email' ? <EmailForm onSubmit={(v) => m.mutate(v)} /> : <UsernameForm onSubmit={(v) => m.mutate(v)} />}
      {m.error && <Notice>{m.error.message}</Notice>}
      <p className="text-sm text-slate-500">New here? <FooterLink to="/register">Register your company</FooterLink></p>
    </AuthShell>
  )
}

function EmailForm({ onSubmit }: { onSubmit: (v: z.infer<typeof emailLogin>) => void }) {
  const form = useForm({ resolver: zodResolver(emailLogin), defaultValues: { email: '', password: '' } })
  const { errors } = form.formState
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <FormField label="Email" htmlFor="femail" error={errors.email?.message}><TextInput id="femail" type="email" autoComplete="email" {...form.register('email')} /></FormField>
      <FormField label="Password" htmlFor="fpassword" error={errors.password?.message}><TextInput id="fpassword" type="password" autoComplete="current-password" {...form.register('password')} /></FormField>
      <Button type="submit" size="lg" className="w-full">Sign in</Button>
    </form>
  )
}

function UsernameForm({ onSubmit }: { onSubmit: (v: z.infer<typeof usernameLogin>) => void }) {
  const form = useForm({ resolver: zodResolver(usernameLogin), defaultValues: { workspace: '', username: '', password: '' } })
  const { errors } = form.formState
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <FormField label="Workspace" htmlFor="fworkspace" error={errors.workspace?.message}><TextInput id="fworkspace" placeholder="your-company" autoComplete="organization" {...form.register('workspace')} /></FormField>
      <FormField label="Username" htmlFor="fusername" error={errors.username?.message}><TextInput id="fusername" autoComplete="username" {...form.register('username')} /></FormField>
      <FormField label="Password" htmlFor="fpassword" error={errors.password?.message}><TextInput id="fpassword" type="password" autoComplete="current-password" {...form.register('password')} /></FormField>
      <Button type="submit" size="lg" className="w-full">Sign in</Button>
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
    <AuthShell title="Register your company" subtitle="Create a workspace for your team in a minute.">
      <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4">
        <FormField label="Company name" htmlFor="fcompanyname" error={errors.company_name?.message}><TextInput id="fcompanyname" {...r('company_name')} /></FormField>
        <FormField label="Workspace URL name" htmlFor="fworkspaceurlname" error={errors.company_slug?.message}><TextInput id="fworkspaceurlname" placeholder="acme-machining" {...r('company_slug')} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First name" htmlFor="ffirstname" error={errors.first_name?.message}><TextInput id="ffirstname" {...r('first_name')} /></FormField>
          <FormField label="Last name" htmlFor="flastname" error={errors.last_name?.message}><TextInput id="flastname" {...r('last_name')} /></FormField>
        </div>
        <FormField label="Work email" htmlFor="fworkemail" error={errors.email?.message}><TextInput id="fworkemail" type="email" autoComplete="email" {...r('email')} /></FormField>
        <FormField label="Password" htmlFor="fpassword" error={errors.password?.message}><TextInput id="fpassword" type="password" autoComplete="new-password" {...r('password')} /></FormField>
        {errorText(m.error) && <Notice>{errorText(m.error)}</Notice>}
        <Button type="submit" size="lg" className="w-full" loading={m.isPending}>Create company</Button>
      </form>
      <p className="text-sm text-slate-500">Already registered? <FooterLink to="/login">Sign in</FooterLink></p>
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
      {forced && <p className="text-sm text-slate-500">Your administrator gave you a temporary password. Replace it to continue.</p>}
      <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4">
        <FormField label="Current password" htmlFor="fcurrentpassword" error={errors.current_password?.message}><TextInput id="fcurrentpassword" type="password" autoComplete="current-password" {...form.register('current_password')} /></FormField>
        <FormField label="New password" htmlFor="fnewpassword" error={errors.new_password?.message}><TextInput id="fnewpassword" type="password" autoComplete="new-password" {...form.register('new_password')} /></FormField>
        <FormField label="Confirm new password" htmlFor="fconfirmnewpassword" error={errors.confirm?.message}><TextInput id="fconfirmnewpassword" type="password" autoComplete="new-password" {...form.register('confirm')} /></FormField>
        <Button type="submit" size="lg" className="w-full" loading={m.isPending}>Change password</Button>
        {!forced && <Button type="button" variant="secondary" className="w-full" onClick={() => nav(-1)}>Cancel</Button>}
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
        <Notice title="This invitation can’t be used">It is invalid, expired or was withdrawn. Ask your administrator to send a new one.</Notice>
        <p className="text-sm"><FooterLink to="/login">Go to sign in</FooterLink></p>
      </AuthShell>
    )
  }
  const inv = preview.data
  const { errors } = form.formState
  return (
    <AuthShell title={`Join ${inv.company_name}`}>
      <p className="text-sm text-slate-500">Invitation for <strong>{inv.email}</strong>.</p>
      {inv.requires_password ? (
        <form onSubmit={form.handleSubmit((v) => accept.mutate(v.password))} className="space-y-4">
          <FormField label="Choose a password" htmlFor="fchooseapassword" error={errors.password?.message}><TextInput id="fchooseapassword" type="password" autoComplete="new-password" {...form.register('password')} /></FormField>
          <FormField label="Confirm password" htmlFor="fconfirmpassword" error={errors.confirm?.message}><TextInput id="fconfirmpassword" type="password" autoComplete="new-password" {...form.register('confirm')} /></FormField>
          {accept.error && !errors.password && <Notice>{accept.error.message}</Notice>}
          <Button type="submit" size="lg" className="w-full" loading={accept.isPending}>Activate account</Button>
        </form>
      ) : me?.email?.toLowerCase() === inv.email.toLowerCase() ? (
        <div className="space-y-4">
          <p className="text-sm">You already have an account. Accept to add this company to it.</p>
          {accept.error && <Notice>{accept.error.message}</Notice>}
          <Button size="lg" className="w-full" loading={accept.isPending} onClick={() => accept.mutate('')}>Accept invitation</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">This email already has an account. Sign in as <strong>{inv.email}</strong>, then open this link again.</p>
          <Link to="/login" className={buttonClass('primary', 'lg', 'w-full')}>Sign in</Link>
        </div>
      )}
    </AuthShell>
  )
}
