import { AlertCircle, Inbox, Loader2 } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

/** Legacy layout primitives rendered in the new design. */
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-2xl border border-slate-200/70 bg-white shadow-[var(--shadow-card)]', className)} {...p} />
)
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900', className)} {...p} />
)
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-5', className)} {...p} />
)

const tones = {
  gray: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
}
const dots = { gray: 'bg-slate-400', blue: 'bg-sky-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500' }
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset', tones[tone])}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dots[tone])} aria-hidden />
      {children}
    </span>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin text-indigo-500" /> {label}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center" role="alert">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 ring-1 ring-rose-100"><AlertCircle className="h-6 w-6" /></div>
      <p className="max-w-sm text-sm text-slate-600">{error instanceof Error ? error.message : 'Something went wrong.'}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="relative mb-2">
        <div className="absolute inset-0 -m-3 rounded-full bg-indigo-100/70 blur-xl" aria-hidden />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-sky-50 text-indigo-500 ring-1 ring-indigo-100"><Inbox className="h-6 w-6" /></div>
      </div>
      <p className="text-[15px] font-semibold text-slate-900">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {action}
    </div>
  )
}

export const Table = (p: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="overflow-x-auto"><table className="w-full text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-indigo-50/40" {...p} /></div>
)
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500', className)} {...p} />
)
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('border-b border-slate-100 px-5 py-3.5 text-slate-700', className)} {...p} />
)

export function Pager({ page, count, pageSize = 20, onPage }: { page: number; count: number; pageSize?: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  return (
    <div className="flex items-center justify-between px-5 py-3 text-[13px] text-slate-500">
      <span>{count} total{pages > 1 && ` · page ${page} of ${pages}`}</span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
