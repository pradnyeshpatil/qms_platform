import { useQuery } from '@tanstack/react-query'
import { ListTodo, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/kit/button'
import { Card, PageTitle } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton } from '@/components/kit/feedback'
import { TextInput } from '@/components/kit/inputs'
import { Segmented } from '@/components/kit/segmented'
import { Pager } from '@/components/kit/table'
import { api, qs, tenantPath } from '@/lib/api'
import type { Page } from '@/lib/types'
import { useCan } from '@/features/auth/auth'
import { useEmployeeOptions } from '@/features/complaints/api'
import type { Task } from '@/features/eight-d/types'
import { useSlug } from '@/layout/AppLayout'
import { NewTaskModal, TaskRow, useTaskMutations } from './TasksPanel'

type View = 'mine' | 'open' | 'overdue' | 'done'
const FILTERS: Record<View, Record<string, string | boolean>> = {
  mine: { mine: true, open: true }, open: { open: true }, overdue: { overdue: true }, done: { open: false },
}

export function TasksPage() {
  const slug = useSlug()
  const can = useCan()
  const [sp, setSp] = useSearchParams()
  const view = (sp.get('view') as View) || 'mine'
  const search = sp.get('search') ?? ''
  const page = Number(sp.get('page') ?? 1)
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }) }
  const [adding, setAdding] = useState(false)
  const people = useEmployeeOptions(can('tasks.create') && can('users.view'))
  const { toggle } = useTaskMutations()
  const q = useQuery({
    queryKey: [slug, 'tasks', 'list', view, search, page],
    queryFn: () => api<Page<Task>>(tenantPath(slug, `tasks/${qs({ ...FILTERS[view], search, page, ordering: view === 'done' ? '-created_at' : 'due_date' })}`)),
    placeholderData: (prev) => prev,
  })
  return (
    <>
      <PageTitle title="Tasks" subtitle="Follow-up work from complaints and 8D reports."
        actions={can('tasks.create') ? <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New task</Button> : undefined} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <Segmented<View> label="Task view" value={view} onChange={(v) => set('view', v === 'mine' ? '' : v)} options={[{ value: 'mine', label: 'Mine' }, { value: 'open', label: 'All open' }, { value: 'overdue', label: 'Overdue' }, { value: 'done', label: 'Finished' }]} />
          <div className="min-w-56 flex-1"><TextInput aria-label="Search tasks" icon={<Search className="h-4 w-4" />} placeholder="Search tasks" defaultValue={search} onChange={(e) => set('search', e.target.value)} /></div>
        </div>
        {q.isLoading ? <ListSkeleton rows={5} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : !q.data?.results.length ? (
          <EmptyPanel icon={<ListTodo className="h-6 w-6" />} title={view === 'mine' ? 'Nothing assigned to you' : 'No tasks here'} hint="Tasks created from 8D actions and complaints show up here." />
        ) : (
          <>
            <ul className="divide-y divide-slate-100 px-5">{q.data.results.map((t) => <TaskRow key={t.id} t={t} showLinks busy={toggle.isPending} onToggle={() => toggle.mutate(t)} />)}</ul>
            <div className="border-t border-slate-100"><Pager page={page} count={q.data.count} pageSize={20} noun="task" onPage={(p) => set('page', String(p))} /></div>
          </>
        )}
      </Card>
      <NewTaskModal open={adding} onOpenChange={setAdding} people={people.data} />
    </>
  )
}
