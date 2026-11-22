import { AlertCircle, Inbox, Loader2 } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-lg border border-border bg-card shadow-sm', className)} {...p} />
)
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('border-b border-border p-4 font-semibold', className)} {...p} />
)
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-4', className)} {...p} />
)

const tones = {
  gray: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
}
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center" role="alert">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm">{error instanceof Error ? error.message : 'Something went wrong.'}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  )
}

export const Table = (p: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="overflow-x-auto"><table className="w-full text-sm" {...p} /></div>
)
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('border-b border-border px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground', className)} {...p} />
)
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('border-b border-border px-4 py-3', className)} {...p} />
)

export function Pager({ page, count, pageSize = 20, onPage }: { page: number; count: number; pageSize?: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  return (
    <div className="flex items-center justify-between p-4 text-sm text-muted-foreground">
      <span>{count} total</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span>Page {page} of {pages}</span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  )
}
