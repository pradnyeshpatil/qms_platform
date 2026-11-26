import * as React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...p }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-2xl border border-slate-200/70 bg-white shadow-[var(--shadow-card)]', className)} {...p} />
}

export function CardHeading({ title, hint, action, className }: { title: string; hint?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pb-1 pt-5', className)}>
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-slate-500">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

/** Page title block used by the redesigned pages. */
export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
