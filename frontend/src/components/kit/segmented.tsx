import * as TabsPrimitive from '@radix-ui/react-tabs'
import { motion } from 'motion/react'
import * as React from 'react'
import { cn } from '@/lib/utils'

/** Pill switcher with a sliding highlight. Good for 2-5 quick filters. */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string; size?: 'sm' | 'md'
}) {
  const id = React.useId()
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-slate-100/80 p-1 ring-1 ring-slate-200/60">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.value)}
            className={cn(
              'relative rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]',
              active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {active && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-lg bg-white shadow-sm ring-1 ring-slate-200/70" transition={{ type: 'spring', damping: 30, stiffness: 420 }} />}
            <span className="relative flex items-center gap-1.5">
              {o.label}
              {o.count !== undefined && <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', active ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200/70 text-slate-500')}>{o.count}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Underlined tabs (Radix: keyboard + aria for free) with a sliding indicator. */
export function TabBar<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; icon?: React.ReactNode; count?: number }[] }) {
  const id = React.useId()
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsPrimitive.List className="scroll-thin flex gap-1 overflow-x-auto border-b border-slate-200/80" aria-label="Sections">
        {tabs.map((t) => {
          const active = t.value === value
          return (
            <TabsPrimitive.Trigger
              key={t.value} value={t.value}
              className={cn('relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/60', active ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800')}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && t.count > 0 && <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500')}>{t.count}</span>}
              {active && <motion.span layoutId={`tab-${id}`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-600" transition={{ type: 'spring', damping: 30, stiffness: 420 }} />}
            </TabsPrimitive.Trigger>
          )
        })}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  )
}
