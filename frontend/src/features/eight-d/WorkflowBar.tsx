import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Lock, RotateCcw, Send, Truck, XCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/kit/button'
import { Notice } from '@/components/kit/feedback'
import { FormField, SelectInput, TextArea, TextInput } from '@/components/kit/inputs'
import { Modal } from '@/components/kit/overlay'
import { api, tenantPath } from '@/lib/api'
import type { Employee } from '@/lib/types'
import { useCan } from '@/features/auth/auth'
import { useMembership } from '@/features/complaints/api'
import { useSlug } from '@/layout/AppLayout'
import { useRefreshReport } from './api'
import { employeeName } from './fields'
import type { EightDDetail } from './types'

type Kind = 'request' | 'approve' | 'reject' | 'submit' | 'reopen'

function ActionModal({ kind, report, people, onClose }: { kind: Kind; report: EightDDetail; people: Employee[] | undefined; onClose: () => void }) {
  const slug = useSlug()
  const refresh = useRefreshReport()
  const [approver, setApprover] = useState(report.approver ?? '')
  const [signed, setSigned] = useState('')
  const [comment, setComment] = useState('')
  const [method, setMethod] = useState('Email')
  const [recipient, setRecipient] = useState('')
  const base = `eight-d-reports/${report.id}`
  const config = {
    request: { title: 'Send for approval', label: 'Send for approval', path: 'request-approval', body: { approver: approver || null } },
    approve: { title: 'Approve this report', label: 'Approve and lock', path: 'decide', body: { decision: 'approved', signed_name: signed, comment } },
    reject: { title: 'Reject this report', label: 'Reject', path: 'decide', body: { decision: 'rejected', comment } },
    submit: { title: 'Record as sent to the customer', label: 'Mark as sent', path: 'submit', body: { method, recipient } },
    reopen: { title: 'Reopen as a new revision', label: 'Reopen', path: 'reopen', body: { reason: comment } },
  }[kind]
  const m = useMutation({
    mutationFn: () => api<EightDDetail>(tenantPath(slug, `${base}/${config.path}/`), { method: 'POST', body: config.body }),
    onSuccess: (r) => { refresh(r); onClose(); toast.success(config.title) },
  })
  const missing = report.completion.missing_required
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={config.title}
      description={kind === 'approve' ? 'Approving locks the report and stores a snapshot that cannot be changed.' : kind === 'reopen' ? 'The report returns to In progress as the next revision. Earlier snapshots are kept.' : undefined}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={kind === 'reject' ? 'danger' : 'primary'} loading={m.isPending} onClick={() => m.mutate()}>{config.label}</Button></>}>
      <div className="space-y-4">
        {kind === 'request' && (
          <>
            {missing.length > 0 && <Notice tone="warning" title="Not ready yet">Complete these sections first: {missing.join(', ')}.</Notice>}
            <FormField label="Approver" htmlFor="approver" hint="Only this person can approve or reject.">
              {people ? <SelectInput id="approver" value={approver} onChange={(e) => setApprover(e.target.value)}><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{employeeName(p)}</option>)}</SelectInput>
                : <p className="text-sm text-slate-600">{report.approver_name ?? 'No approver is set. Ask someone who can view employees to choose one.'}</p>}
            </FormField>
          </>
        )}
        {kind === 'approve' && <FormField label="Type your full name to sign" htmlFor="signed"><TextInput id="signed" value={signed} onChange={(e) => setSigned(e.target.value)} autoComplete="name" /></FormField>}
        {(kind === 'approve') && <FormField label="Comment" htmlFor="c" optional><TextArea id="c" value={comment} onChange={(e) => setComment(e.target.value)} /></FormField>}
        {kind === 'reject' && <FormField label="What needs to change?" htmlFor="c" hint="Required. The author sees this."><TextArea id="c" value={comment} onChange={(e) => setComment(e.target.value)} /></FormField>}
        {kind === 'reopen' && <FormField label="Reason" htmlFor="c" hint="Required and recorded in the audit log."><TextArea id="c" value={comment} onChange={(e) => setComment(e.target.value)} /></FormField>}
        {kind === 'submit' && (
          <>
            <FormField label="How was it sent?" htmlFor="m"><TextInput id="m" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Email, portal, post…" /></FormField>
            <FormField label="Sent to" htmlFor="r"><TextInput id="r" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Name or email at the customer" /></FormField>
          </>
        )}
        {m.error && <Notice title="Couldn’t do that">{m.error.message}</Notice>}
      </div>
    </Modal>
  )
}

/** Only the next sensible step(s) for the report's state, filtered by what this person may do. */
export function WorkflowBar({ report, people }: { report: EightDDetail; people: Employee[] | undefined }) {
  const can = useCan()
  const { membership } = useMembership()
  const slug = useSlug()
  const refresh = useRefreshReport()
  const [kind, setKind] = useState<Kind | null>(null)
  const close = useMutation({
    mutationFn: () => api<EightDDetail>(tenantPath(slug, `eight-d-reports/${report.id}/close/`), { method: 'POST', body: {} }),
    onSuccess: (r) => { refresh(r); toast.success('Report closed') },
    onError: (e: Error) => toast.error(e.message),
  })
  const s = report.status
  const mine = !report.approver || report.approver === membership?.id
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(s === 'draft' || s === 'in_progress') && can('eight_d_reports.update') && <Button onClick={() => setKind('request')}><Send className="h-4 w-4" /> Send for approval</Button>}
        {s === 'pending_approval' && can('eight_d_reports.approve') && mine && <>
          <Button onClick={() => setKind('approve')}><CheckCircle2 className="h-4 w-4" /> Approve</Button>
          <Button variant="danger-soft" onClick={() => setKind('reject')}><XCircle className="h-4 w-4" /> Reject</Button></>}
        {s === 'pending_approval' && !(can('eight_d_reports.approve') && mine) && <span className="inline-flex items-center gap-1.5 text-sm text-slate-500"><Lock className="h-4 w-4" /> Waiting for {report.approver_name ?? 'the approver'}</span>}
        {s === 'approved' && can('eight_d_reports.update') && <Button onClick={() => setKind('submit')}><Truck className="h-4 w-4" /> Mark as sent to customer</Button>}
        {s === 'submitted' && can('eight_d_reports.update') && <Button loading={close.isPending} onClick={() => close.mutate()}><CheckCircle2 className="h-4 w-4" /> Close report</Button>}
        {(s === 'approved' || s === 'submitted' || s === 'closed') && can('eight_d_reports.reopen') && <Button variant="secondary" onClick={() => setKind('reopen')}><RotateCcw className="h-4 w-4" /> Reopen</Button>}
      </div>
      {kind && <ActionModal kind={kind} report={report} people={people} onClose={() => setKind(null)} />}
    </>
  )
}
