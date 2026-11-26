import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { Download, File as FileIcon, FileImage, FileSpreadsheet, FileText, Paperclip, Trash2, UploadCloud, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/kit/button'
import { Card } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton } from '@/components/kit/feedback'
import { Reveal } from '@/components/kit/motion'
import { ConfirmDialog } from '@/components/kit/overlay'
import { api, tenantPath, upload } from '@/lib/api'
import { fileSize, timeAgo } from '@/lib/format'
import type { Attachment, Page } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useCan } from '@/features/auth/auth'
import { useSlug } from '@/layout/AppLayout'
import { targetQuery, useMembership } from './api'
import { checkFile } from './rules'

type Job = { id: string; name: string; progress: number; error?: string }

function TypeIcon({ type }: { type: string }) {
  const cls = 'h-7 w-7'
  if (type.startsWith('image/')) return <FileImage className={cn(cls, 'text-sky-500')} />
  if (type.includes('spreadsheet') || type.includes('excel') || type === 'text/csv') return <FileSpreadsheet className={cn(cls, 'text-emerald-500')} />
  if (type === 'application/pdf') return <FileText className={cn(cls, 'text-rose-500')} />
  if (type.includes('word') || type.startsWith('text/')) return <FileText className={cn(cls, 'text-indigo-500')} />
  return <FileIcon className={cn(cls, 'text-slate-400')} />
}

function FileCard({ a, index, canDelete, onDelete }: { a: Attachment; index: number; canDelete: boolean; onDelete: () => void }) {
  return (
    <Reveal as="li" index={index} className="group overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80 transition hover:shadow-[var(--shadow-lift)] hover:ring-indigo-200">
      <a href={a.download_url} download className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60" aria-label={`Download ${a.original_name}`}>
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
          {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <TypeIcon type={a.content_type} />}
        </div>
      </a>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-slate-800" title={a.original_name}>{a.original_name}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">{fileSize(a.size)} · {a.uploaded_by ?? 'Unknown'} · {timeAgo(a.created_at)}</p>
        <div className="mt-2 flex items-center gap-1">
          <a href={a.download_url} download className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"><Download className="h-3.5 w-3.5" /> Download</a>
          {canDelete && <button type="button" onClick={onDelete} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${a.original_name}`}><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      </div>
    </Reveal>
  )
}

export function FilesPanel({ complaintId, targetType = 'complaint' }: { complaintId: string; targetType?: string }) {
  const slug = useSlug()
  const can = useCan()
  const qc = useQueryClient()
  const { me } = useMembership()
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [deleting, setDeleting] = useState<Attachment | null>(null)
  const key = [slug, 'attachments', complaintId]
  const q = useQuery({ queryKey: key, queryFn: () => api<Page<Attachment>>(tenantPath(slug, `attachments/${targetQuery(complaintId, { page_size: 100 }, targetType)}`)) })
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: [slug, 'activity', complaintId] }); qc.invalidateQueries({ queryKey: [slug, 'counts', complaintId] }) }

  const patchJob = (id: string, patch: Partial<Job>) => setJobs((j) => j.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const send = (files: File[]) => {
    for (const file of files) {
      const id = crypto.randomUUID()
      const problem = checkFile(file)
      setJobs((j) => [...j, { id, name: file.name, progress: 0, error: problem ?? undefined }])
      if (problem) continue
      const form = new FormData()
      form.set('target_type', targetType); form.set('target_id', complaintId); form.set('file', file)
      upload(tenantPath(slug, 'attachments/'), form, (f) => patchJob(id, { progress: f }))
        .then(() => { patchJob(id, { progress: 1 }); refresh(); setTimeout(() => setJobs((j) => j.filter((x) => x.id !== id)), 900) })
        .catch((e: Error) => patchJob(id, { error: e.message }))
    }
  }
  const del = useMutation({
    mutationFn: (a: Attachment) => api(tenantPath(slug, `attachments/${a.id}/`), { method: 'DELETE' }),
    onSuccess: () => { setDeleting(null); refresh(); toast.success('File removed') },
    onError: (e: Error) => { setDeleting(null); toast.error(e.message) },
  })
  const myName = `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim() || me?.email
  const canUpload = can('attachments.upload')
  const canDeleteAny = can('attachments.delete')

  return (
    <div className="flex flex-col gap-5">
      {canUpload && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); send([...e.dataTransfer.files]) }}
          className={cn('relative rounded-2xl border-2 border-dashed p-8 text-center transition-colors', drag ? 'border-indigo-400 bg-indigo-50/70' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/60')}
        >
          <input ref={inputRef} type="file" multiple className="sr-only" aria-label="Choose files to attach" onChange={(e) => { send([...(e.target.files ?? [])]); e.target.value = '' }} />
          <motion.div animate={{ y: drag ? -4 : 0, scale: drag ? 1.06 : 1 }} className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><UploadCloud className="h-6 w-6" /></motion.div>
          <p className="text-sm font-medium text-slate-800">{drag ? 'Drop to upload' : 'Drag files here'}</p>
          <p className="mt-0.5 text-xs text-slate-500">PDF, images, Word, Excel, CSV · up to 25 MB each</p>
          <Button variant="soft" size="sm" className="mt-4" onClick={() => inputRef.current?.click()}><Paperclip className="h-4 w-4" /> Choose files</Button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {jobs.map((j) => (
          <motion.div key={j.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className={cn('flex items-center gap-3 rounded-xl px-4 py-3 ring-1', j.error ? 'bg-rose-50 ring-rose-200' : 'bg-white ring-slate-200')}>
              <FileIcon className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{j.name}</p>
                {j.error ? <p role="alert" className="text-xs text-rose-600">{j.error}</p> : (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(j.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" animate={{ width: `${Math.max(4, j.progress * 100)}%` }} transition={{ ease: 'easeOut', duration: 0.2 }} />
                  </div>
                )}
              </div>
              {j.error && <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => setJobs((x) => x.filter((y) => y.id !== j.id))}><X className="h-4 w-4" /></Button>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {q.isLoading ? <Card><ListSkeleton rows={2} /></Card> : q.isError ? <Card><ErrorPanel error={q.error} onRetry={() => q.refetch()} /></Card> : q.data!.results.length === 0 ? (
        <Card><EmptyPanel icon={<Paperclip className="h-6 w-6" />} title="No files yet" hint={canUpload ? 'Add photos, inspection reports or customer documents.' : 'Nothing has been attached to this complaint.'} /></Card>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {q.data!.results.map((a, i) => <FileCard key={a.id} a={a} index={i} canDelete={canDeleteAny || (canUpload && a.uploaded_by === myName)} onDelete={() => setDeleting(a)} />)}
        </ul>
      )}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Remove this file?" description={deleting ? `“${deleting.original_name}” will no longer be listed. The removal is recorded in the activity log.` : ''} confirmLabel="Remove" danger loading={del.isPending} onConfirm={() => deleting && del.mutate(deleting)} />
    </div>
  )
}
