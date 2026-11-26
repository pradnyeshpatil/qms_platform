import { AlertCircle, ChevronDown } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

const control =
  'w-full rounded-xl bg-white px-3.5 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 transition ' +
  'hover:ring-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ' +
  'aria-[invalid=true]:ring-rose-400 aria-[invalid=true]:focus:ring-rose-500/70'

export function TextInput({ className, icon, ...p }: React.ComponentProps<'input'> & { icon?: React.ReactNode }) {
  if (!icon) return <input className={cn(control, 'h-11', className)} {...p} />
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
      <input className={cn(control, 'h-11 pl-10', className)} {...p} />
    </div>
  )
}

export function TextArea({ className, ...p }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-28 resize-y py-3 leading-relaxed', className)} {...p} />
}

export function SelectInput({ className, children, ...p }: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select className={cn(control, 'h-11 cursor-pointer appearance-none pr-10', className)} {...p}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
    </div>
  )
}

/** Label + control + hint / error. Pass the control as children; give it `id={htmlFor}`. */
export function FormField({ label, htmlFor, error, hint, optional, children, className }: {
  label: string; htmlFor?: string; error?: string; hint?: string; optional?: boolean; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-[13px] font-medium text-slate-700">
        {label}
        {optional && <span className="text-xs font-normal text-slate-400">optional</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="flex animate-rise items-center gap-1 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5" aria-hidden />{error}</p>
      ) : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

/** On/off switch with a visible label (used for "active", "default", ...). */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 disabled:opacity-50',
        checked ? 'bg-indigo-600' : 'bg-slate-300',
      )}
    >
      <span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200', checked && 'translate-x-5')} />
    </button>
  )
}
