import { cn } from '@/lib/utils'
import type { Severity, StatusCategory } from '@/lib/types'
import { CATEGORY_STYLE, SEVERITY_STYLE } from './theme'

const pill = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset'

export function StatusPill({ name, category, className }: { name: string; category: StatusCategory; className?: string }) {
  const s = CATEGORY_STYLE[category]
  return (
    <span className={cn(pill, s.pill, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden />
      {name}
    </span>
  )
}

export function SeverityPill({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEVERITY_STYLE[severity]
  return (
    <span className={cn(pill, s.pill, className)}>
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        {severity === 'critical' && <span className="absolute inset-0 animate-[var(--animate-pulse-ring)] rounded-full bg-rose-500" />}
        <span className={cn('relative h-1.5 w-1.5 rounded-full', s.dot)} />
      </span>
      {s.label}
    </span>
  )
}

export function Chip({ children, tone = 'slate', className }: { children: React.ReactNode; tone?: 'slate' | 'indigo' | 'rose' | 'amber' | 'emerald'; className?: string }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 ring-slate-500/15',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    rose: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  }
  return <span className={cn(pill, tones[tone], className)}>{children}</span>
}
