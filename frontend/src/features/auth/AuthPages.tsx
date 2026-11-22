import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form-controls'
import { Card, CardContent } from '@/components/ui/misc'
import { api, ApiError } from '@/lib/api'
import type { Me } from '@/lib/types'
import { ME_KEY, useMe } from './auth'

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 p-8">
          <div>
            <p className="text-sm font-semibold text-primary">QMS Platform</p>
            <h1 className="text-2xl font-bold">{title}</h1>
          </div>
          {children}
        </CardContent>
      </Card>
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
    <AuthShell title="Sign in">
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm" role="tablist">
        {(['email', 'username'] as const).map((k) => (
          <button
            key={k} type="button" role="tab" aria-selected={mode === k}
            onClick={() => { setMode(k); m.reset() }}
            className={`rounded px-3 py-1.5 font-medium ${mode === k ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            {k === 'email' ? 'Email' : 'Username'}
          </button>
        ))}
      </div>
      {mode === 'email' ? <EmailForm onSubmit={(v) => m.mutate(v)} /> : <UsernameForm onSubmit={(v) => m.mutate(v)} />}
      {m.error && <p role="alert" className="text-sm text-destructive">{m.error.message}</p>}
      <p className="text-sm text-muted-foreground">New here? <Link className="text-primary underline" to="/register">Register your company</Link></p>
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
    <AuthShell title="Register your company">
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
      <p className="text-sm text-muted-foreground">Already registered? <Link className="text-primary underline" to="/login">Sign in</Link></p>
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
        <Link className="text-sm text-primary underline" to="/login">Go to sign in</Link>
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
