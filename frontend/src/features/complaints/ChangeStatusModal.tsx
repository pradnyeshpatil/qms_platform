import { useMutation } from '@tanstack/react-query'
import { Lock, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/kit/button'
import { Notice } from '@/components/kit/feedback'
import { FormField, TextArea } from '@/components/kit/inputs'
import { Modal } from '@/components/kit/overlay'
import { CATEGORY_STYLE } from '@/components/kit/theme'
import { api, ApiError, tenantPath } from '@/lib/api'
import { CATEGORY_LABEL, type Complaint, type WorkflowStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useCan } from '@/features/auth/auth'
import { useSlug } from '@/layout/AppLayout'
import { useRefreshComplaint } from './api'
import { blockedReason } from './rules'

export function ChangeStatusModal({ complaint, statuses, open, onOpenChange }: { complaint: Complaint; statuses: WorkflowStatus[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const slug = useSlug()
  const can = useCan()
  const refresh = useRefreshComplaint()
  const canClose = can('complaints.close')
  const current = statuses.find((s) => s.id === complaint.status)
  const options = statuses.filter((s) => s.is_active || s.id === complaint.status).sort((a, b) => a.sort_order - b.sort_order)
  const [target, setTarget] = useState(complaint.status)
  const [comment, setComment] = useState(complaint.closure_comment)
  useEffect(() => { if (open) { setTarget(complaint.status); setComment(complaint.closure_comment) } }, [open, complaint.status, complaint.closure_comment])

  const chosen = options.find((s) => s.id === target)
  const closing = chosen?.category === 'closed'
  const reopening = !!current?.is_finished && !!chosen && !chosen.is_finished
  const m = useMutation({
    mutationFn: () => api<Complaint>(tenantPath(slug, `complaints/${complaint.id}/change-status/`), { method: 'POST', body: { status: target, ...(closing ? { closure_comment: comment } : {}) } }),
    onSuccess: (c) => {
      refresh(c)
      onOpenChange(false)
      toast.success(`Status changed to ${c.status_name}`)
      for (const w of c.warnings ?? []) toast.warning(w.message)
    },
  })
  const fieldError = m.error instanceof ApiError ? m.error.fieldErrors.closure_comment : undefined
  const generalError = m.error && !fieldError ? (m.error instanceof Error ? m.error.message : 'Something went wrong.') : ''
  const unchanged = target === complaint.status
  const needsComment = closing && !comment.trim()

  return (
    <Modal
      open={open} onOpenChange={onOpenChange} title="Change status" description={`${complaint.number} is currently “${complaint.status_name}”.`}
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button loading={m.isPending} disabled={unchanged || needsComment} onClick={() => m.mutate()}>{reopening ? 'Reopen complaint' : closing ? 'Close complaint' : 'Update status'}</Button>
      </>}
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="New status" className="grid gap-2">
          {options.map((s) => {
            const reason = current ? blockedReason(current, s, canClose) : null
            const active = s.id === target
            return (
              <label
                key={s.id}
                className={cn('flex items-center gap-3 rounded-xl px-3.5 py-2.5 ring-1 transition', reason ? 'cursor-not-allowed bg-slate-50 opacity-60 ring-slate-200' : 'cursor-pointer', !reason && (active ? 'bg-indigo-50/70 ring-2 ring-indigo-500' : 'bg-white ring-slate-200 hover:ring-slate-300'), 'focus-within:ring-2 focus-within:ring-indigo-500/60')}
              >
                <input type="radio" name="status" className="sr-only" checked={active} disabled={!!reason} onChange={() => setTarget(s.id)} />
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', CATEGORY_STYLE[s.category].dot)} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{s.name}{s.id === complaint.status && <span className="ml-2 text-xs font-normal text-slate-400">current</span>}</span>
                  <span className="block text-xs text-slate-500">{reason ?? CATEGORY_LABEL[s.category]}</span>
                </span>
                {reason && <Lock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
              </label>
            )
          })}
        </div>
        {reopening && <Notice tone="info"><span className="flex items-center gap-2"><RotateCcw className="h-4 w-4" aria-hidden /> This reopens a finished complaint. It will be recorded in the activity log.</span></Notice>}
        {closing && (
          <FormField label="Closure comment" htmlFor="closure" error={fieldError} hint="Required. Summarise how the complaint was resolved.">
            <TextArea id="closure" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Root cause fixed, customer confirmed on 12 Jan." aria-invalid={!!fieldError} />
          </FormField>
        )}
        {generalError && <Notice title="Couldn’t change the status">{generalError}</Notice>}
      </div>
    </Modal>
  )
}
