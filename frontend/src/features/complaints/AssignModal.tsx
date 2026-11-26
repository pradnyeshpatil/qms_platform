import { useMutation } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Avatar } from '@/components/kit/avatar'
import { Button } from '@/components/kit/button'
import { ListSkeleton, Notice } from '@/components/kit/feedback'
import { FormField, SelectInput, TextInput } from '@/components/kit/inputs'
import { Modal } from '@/components/kit/overlay'
import { api, tenantPath } from '@/lib/api'
import type { Complaint, Employee } from '@/lib/types'
import { useSlug } from '@/layout/AppLayout'
import { useEmployeeOptions, useRefreshComplaint } from './api'

const nameOf = (m: Employee) => `${m.first_name} ${m.last_name}`.trim() || m.email || m.username || 'Unnamed'

export function AssignModal({ complaint, open, onOpenChange }: { complaint: Complaint; open: boolean; onOpenChange: (o: boolean) => void }) {
  const slug = useSlug()
  const refresh = useRefreshComplaint()
  const people = useEmployeeOptions(open)
  const [owner, setOwner] = useState('')
  const [extra, setExtra] = useState<string[]>([])
  const [search, setSearch] = useState('')
  useEffect(() => {
    if (open) { setOwner(complaint.owner ?? ''); setExtra(complaint.assignees.map((a) => a.id)); setSearch('') }
  }, [open, complaint.owner, complaint.assignees])

  const visible = useMemo(() => (people.data ?? []).filter((m) => nameOf(m).toLowerCase().includes(search.toLowerCase())), [people.data, search])
  const toggle = (id: string) => setExtra((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const m = useMutation({
    mutationFn: () => api<Complaint>(tenantPath(slug, `complaints/${complaint.id}/assign/`), { method: 'POST', body: { owner: owner || null, assignees: extra.filter((id) => id !== owner) } }),
    onSuccess: (c) => { refresh(c); onOpenChange(false); toast.success('Assignment updated') },
  })

  return (
    <Modal
      open={open} onOpenChange={onOpenChange} title="Assign people" description="The owner is responsible for the complaint. Others can be added to help."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Save</Button></>}
    >
      {people.isPending && !people.isError ? <ListSkeleton rows={3} /> : people.isError || !people.data ? (
        <Notice title="Can’t load your team">You need permission to view employees to assign people.</Notice>
      ) : (
        <div className="space-y-5">
          <FormField label="Owner" htmlFor="owner">
            <SelectInput id="owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Unassigned</option>
              {people.data!.map((p) => <option key={p.id} value={p.id}>{nameOf(p)}</option>)}
            </SelectInput>
          </FormField>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-slate-700">Also working on this</p>
            {people.data!.length > 8 && <div className="mb-2"><TextInput aria-label="Search people" icon={<Search className="h-4 w-4" />} placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} /></div>}
            <ul className="scroll-thin max-h-64 space-y-1 overflow-y-auto rounded-xl ring-1 ring-slate-200">
              {visible.map((p) => {
                const isOwner = p.id === owner
                return (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-slate-50 has-[:disabled]:cursor-default has-[:disabled]:opacity-60">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={isOwner || extra.includes(p.id)} disabled={isOwner} onChange={() => toggle(p.id)} />
                      <Avatar name={nameOf(p)} size="sm" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{nameOf(p)}</span><span className="block truncate text-xs text-slate-500">{p.role.name}{p.department && ` · ${p.department.name}`}</span></span>
                      {isOwner && <span className="text-xs text-slate-400">Owner</span>}
                    </label>
                  </li>
                )
              })}
              {visible.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">No one found</li>}
            </ul>
          </div>
          {m.error && <Notice title="Couldn’t save">{m.error.message}</Notice>}
        </div>
      )}
    </Modal>
  )
}
