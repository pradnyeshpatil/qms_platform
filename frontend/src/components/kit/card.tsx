import * as React from 'react'
import { cn } from '@/lib/utils'
import { TONE, type Tone } from './theme'

/** Gradient icon tile. The colour identifies the app section. */
export function IconTile({ icon: Icon, tone = 'indigo', size = 'md', className }: { icon: React.ComponentType<{ className?: string }>; tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'h-8 w-8 rounded-lg [&>svg]:h-4 [&>svg]:w-4', md: 'h-10 w-10 rounded-xl [&>svg]:h-5 [&>svg]:w-5', lg: 'h-12 w-12 rounded-2xl [&>svg]:h-6 [&>svg]:w-6' }
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-lg', TONE[tone].tile, TONE[tone].glow, sizes[size], className)} aria-hidden>
      <Icon className="" />
    </span>
  )
}

export function Card({ className, ...p }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-2xl border border-slate-200/70 bg-white shadow-[var(--shadow-card)]', className)} {...p} />
}

export function CardHeading({ title, hint, action, className, icon, tone }: { title: string; hint?: string; action?: React.ReactNode; className?: string; icon?: React.ComponentType<{ className?: string }>; tone?: Tone }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pb-1 pt-5', className)}>
      <div className="flex items-start gap-3">
        {icon && <IconTile icon={icon} tone={tone} size="sm" />}
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          {hint && <p className="mt-0.5 text-[13px] text-slate-500">{hint}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

/** Page title block used by the redesigned pages. */
export function PageTitle({ title, subtitle, actions, icon, tone }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: Tone }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-4">
        {icon && <IconTile icon={icon} tone={tone} size="lg" />}
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
