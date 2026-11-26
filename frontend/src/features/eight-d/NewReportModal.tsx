import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/kit/button'
import { Notice } from '@/components/kit/feedback'
import { FormField, SelectInput, TextInput } from '@/components/kit/inputs'
import { Modal } from '@/components/kit/overlay'
import { api, qs, tenantPath } from '@/lib/api'
import type { Complaint, Page } from '@/lib/types'
import { useSlug } from '@/layout/AppLayout'
import { useRefreshReport } from './api'
import type { EightDDetail } from './types'

/** Start an 8D report. With `complaintId` the complaint is fixed; otherwise pick one (open complaints first). */
export function NewReportModal({ open, onOpenChange, complaintId }: { open: boolean; onOpenChange: (o: boolean) => void; complaintId?: string }) {
  const slug = useSlug()
  const nav = useNavigate()
  const refresh = useRefreshReport()
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState('')
  const [title, setTitle] = useState('')
  const complaints = useQuery({
    queryKey: [slug, 'complaints', 'picker', search], enabled: open && !complaintId,
    queryFn: () => api<Page<Complaint>>(tenantPath(slug, `complaints/${qs({ search, open: true, page_size: 20 })}`)),
  })
  const target = complaintId ?? picked
  const m = useMutation({
    mutationFn: () => api<EightDDetail>(tenantPath(slug, 'eight-d-reports/'), { method: 'POST', body: { complaint: target, ...(title.trim() ? { title: title.trim() } : {}) } }),
    onSuccess: (r) => { refresh(r); onOpenChange(false); toast.success(`${r.number} started`); nav(`/${slug}/eight-d/${r.id}`) },
  })
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Start an 8D report" description="The problem description is prefilled from the complaint. You can start several reports for one complaint."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={m.isPending} disabled={!target} onClick={() => m.mutate()}>Start report</Button></>}>
      <div className="space-y-4">
        {!complaintId && (
          <>
            <FormField label="Find a complaint" htmlFor="nr-search"><TextInput id="nr-search" placeholder="Number, title or customer" value={search} onChange={(e) => setSearch(e.target.value)} /></FormField>
            <FormField label="Complaint" htmlFor="nr-complaint">
              <SelectInput id="nr-complaint" value={picked} onChange={(e) => setPicked(e.target.value)}>
                <option value="">{complaints.isLoading ? 'Loading…' : 'Choose a complaint'}</option>
                {complaints.data?.results.map((c) => <option key={c.id} value={c.id}>{c.number} · {c.title}</option>)}
              </SelectInput>
            </FormField>
          </>
        )}
        <FormField label="Report title" htmlFor="nr-title" optional hint="Defaults to the complaint title."><TextInput id="nr-title" value={title} onChange={(e) => setTitle(e.target.value)} /></FormField>
        {m.error && <Notice title="Couldn’t start the report">{m.error.message}</Notice>}
      </div>
    </Modal>
  )
}
