import { AlertCircle, Loader2, SearchX } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('skeleton rounded-lg', className)} aria-hidden />

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
          <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  )
}

export function EmptyPanel({ icon, title, hint, action, className }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 -m-3 rounded-full bg-indigo-100/60 blur-xl" aria-hidden />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-sky-50 text-indigo-500 ring-1 ring-indigo-100">
          {icon ?? <SearchX className="h-6 w-6" />}
        </div>
      </div>
      <p className="text-[15px] font-semibold text-slate-900">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 ring-1 ring-rose-100"><AlertCircle className="h-6 w-6" /></div>
      <p className="max-w-sm text-sm text-slate-600">{msg}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

/** Inline banner for form / action errors. */
export function Notice({ tone = 'error', title, children }: { tone?: 'error' | 'warning' | 'info' | 'success'; title?: string; children?: React.ReactNode }) {
  const tones = {
    error: 'bg-rose-50 text-rose-800 ring-rose-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    info: 'bg-sky-50 text-sky-900 ring-sky-200',
    success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  }
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('animate-rise rounded-xl px-4 py-3 text-sm ring-1 ring-inset', tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
    </div>
  )
}

/** Full-screen spinner shown while the session / route is resolving. */
export function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app" role="status" aria-label="Loading">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-500" aria-hidden />
    </div>
  )
}
