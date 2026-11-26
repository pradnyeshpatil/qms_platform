import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

const base =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 ' +
  'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50'

const variants = {
  primary:
    'text-white bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 bg-[length:140%_100%] bg-left shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_8px_18px_-6px_rgb(99_70_229/0.65)] hover:bg-right hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_12px_26px_-8px_rgb(99_70_229/0.75)] [transition-property:background-position,box-shadow,transform]',
  light: 'bg-white text-indigo-700 shadow-lg shadow-indigo-900/20 hover:bg-indigo-50',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm hover:bg-slate-50 hover:ring-slate-300',
  soft: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
  'danger-soft': 'bg-rose-50 text-rose-700 hover:bg-rose-100',
} as const
const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]', icon: 'h-9 w-9' } as const

export type ButtonVariant = keyof typeof variants
export type ButtonSize = keyof typeof sizes

/** Class string for anything that should look like a button (links, labels). */
export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) =>
  cn(base, variants[variant], sizes[size], className)

export type ButtonProps = React.ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...p }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...p}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
