import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export const Table = ({ className, ...p }: React.ComponentProps<'table'>) => (
  <div className="scroll-thin overflow-x-auto"><table className={cn('w-full text-sm', className)} {...p} /></div>
)
export const Th = ({ className, ...p }: React.ComponentProps<'th'>) => (
  <th className={cn('border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400', className)} {...p} />
)
export const Td = ({ className, ...p }: React.ComponentProps<'td'>) => (
  <td className={cn('border-b border-slate-100 px-5 py-3.5 align-middle text-slate-600', className)} {...p} />
)

/** Footer for paged lists: total + Previous / Next. */
export function Pager({ page, count, pageSize = 20, noun = 'result', onPage }: { page: number; count: number; pageSize?: number; noun?: string; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  const label = `${count} ${count === 1 ? noun : `${noun}s`}`
  if (pages <= 1) return <div className="px-5 py-3 text-[13px] text-slate-500">{label}</div>
  return (
    <div className="flex items-center justify-between px-5 py-3 text-[13px] text-slate-500">
      <span>Page {page} of {pages} · {label}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  )
}
