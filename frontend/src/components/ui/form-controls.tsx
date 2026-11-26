import * as LabelPrimitive from '@radix-ui/react-label'
import { AlertCircle } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

/** Legacy form controls rendered in the new design (same look as components/kit/inputs). */
const field =
  'w-full rounded-xl bg-white px-3.5 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 transition hover:ring-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => <input ref={ref} className={cn(field, 'h-11', className)} {...p} />,
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, 'min-h-28 py-3', className)} {...p} />,
)
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...p }, ref) => <select ref={ref} className={cn(field, 'select-chevron h-11 cursor-pointer', className)} {...p} />,
)
Select.displayName = 'Select'

export const Label = ({ className, ...p }: React.ComponentProps<typeof LabelPrimitive.Root>) => (
  <LabelPrimitive.Root className={cn('text-[13px] font-medium text-slate-700', className)} {...p} />
)

/** Label + control + error message. */
export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p role="alert" className="flex animate-rise items-center gap-1 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5" aria-hidden />{error}</p>}
    </div>
  )
}
