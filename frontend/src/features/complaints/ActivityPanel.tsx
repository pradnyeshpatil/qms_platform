import { useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '@/components/kit/button'
import { Card } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton } from '@/components/kit/feedback'
import { Reveal } from '@/components/kit/motion'
import { api, tenantPath } from '@/lib/api'
import { describeActivity } from '@/lib/activity'
import { dateTime, timeAgo } from '@/lib/format'
import type { ActivityEntry, Page } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSlug } from '@/layout/AppLayout'
import { KIND_STYLE } from './activityStyle'
import { targetQuery } from './api'

export function ActivityItem({ e, index }: { e: ActivityEntry; index: number }) {
  const d = describeActivity(e)
  const { icon: Icon, tone } = KIND_STYLE[d.kind]
  return (
    <Reveal as="li" index={index} className="relative flex gap-4 pb-6 last:pb-0">
      <span className="absolute left-[17px] top-9 -bottom-0 w-px bg-slate-200 last:hidden" aria-hidden />
      <span className={cn('relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-white', tone)}><Icon className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-sm text-slate-700"><span className="font-semibold text-slate-900">{e.actor_name || 'System'}</span> {d.text}</p>
        {d.detail && <p className="mt-1 line-clamp-3 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600 ring-1 ring-slate-200/60">{d.detail}</p>}
        <p className="mt-1 text-xs text-slate-400" title={dateTime(e.created_at)}>{timeAgo(e.created_at)}</p>
      </div>
    </Reveal>
  )
}

export function ActivityPanel({ complaintId, limit }: { complaintId: string; limit?: number }) {
  const slug = useSlug()
  const q = useInfiniteQuery({
    queryKey: [slug, 'activity', complaintId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<Page<ActivityEntry>>(tenantPath(slug, `activity/${targetQuery(complaintId, { page: pageParam, page_size: 20 })}`)),
    getNextPageParam: (last, all) => (last.next ? all.length + 1 : undefined),
  })
  const items = q.data?.pages.flatMap((p) => p.results) ?? []
  const shown = limit ? items.slice(0, limit) : items
  return (
    <Card className="p-5">
      {q.isLoading ? <ListSkeleton rows={3} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : shown.length === 0 ? (
        <EmptyPanel title="Nothing recorded yet" hint="Every change to this complaint will appear here." />
      ) : (
        <>
          <ol>{shown.map((e, i) => <ActivityItem key={e.id} e={e} index={i} />)}</ol>
          {!limit && q.hasNextPage && <div className="mt-5 text-center"><Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Show earlier activity</Button></div>}
        </>
      )}
    </Card>
  )
}
