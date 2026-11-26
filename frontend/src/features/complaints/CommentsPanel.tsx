import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Lock, MessageSquare, Pencil, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Avatar } from '@/components/kit/avatar'
import { Button } from '@/components/kit/button'
import { Card } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton, Notice } from '@/components/kit/feedback'
import { TextArea } from '@/components/kit/inputs'
import { Reveal } from '@/components/kit/motion'
import { ConfirmDialog, Modal } from '@/components/kit/overlay'
import { Chip } from '@/components/kit/pills'
import { Segmented } from '@/components/kit/segmented'
import { api, tenantPath } from '@/lib/api'
import { dateTime, timeAgo } from '@/lib/format'
import type { Comment, CommentEdit, CommentVisibility, Page } from '@/lib/types'
import { useCan } from '@/features/auth/auth'
import { useSlug } from '@/layout/AppLayout'
import { targetQuery, useMembership } from './api'

function History({ comment, open, onOpenChange }: { comment: Comment; open: boolean; onOpenChange: (o: boolean) => void }) {
  const slug = useSlug()
  const q = useQuery({ queryKey: [slug, 'comment-history', comment.id], enabled: open, queryFn: () => api<CommentEdit[]>(tenantPath(slug, `comments/${comment.id}/history/`)) })
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Earlier versions" description="What this comment said before it was edited.">
      {q.isError ? <ErrorPanel error={q.error} /> : !q.data ? <ListSkeleton rows={2} /> : (
        <ol className="space-y-3">
          {q.data.map((h) => (
            <li key={h.id} className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200/70">
              <p className="mb-1 text-xs text-slate-500">{dateTime(h.edited_at)}</p>
              <p className="whitespace-pre-wrap text-slate-700">{h.previous_body}</p>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}

function Item({ c, index, myId, queryKey }: { c: Comment; index: number; myId?: string; queryKey: unknown[] }) {
  const slug = useSlug()
  const can = useCan()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.body)
  const [confirm, setConfirm] = useState(false)
  const [history, setHistory] = useState(false)
  const done = () => { qc.invalidateQueries({ queryKey }); qc.invalidateQueries({ queryKey: [slug, 'activity', c.target_id] }); qc.invalidateQueries({ queryKey: [slug, 'counts', c.target_id] }) }
  const save = useMutation({
    mutationFn: () => api(tenantPath(slug, `comments/${c.id}/`), { method: 'PATCH', body: { body: draft } }),
    onSuccess: () => { setEditing(false); done(); toast.success('Comment updated') },
  })
  const del = useMutation({
    mutationFn: () => api(tenantPath(slug, `comments/${c.id}/`), { method: 'DELETE' }),
    onSuccess: () => { setConfirm(false); done(); toast.success('Comment deleted') },
  })
  const mine = c.author === myId
  const canDelete = mine || can('settings.manage')
  return (
    <Reveal as="li" index={index} className="flex gap-3">
      <Avatar name={c.author_name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-slate-900">{c.author_name ?? 'Former employee'}</span>
          <span className="text-xs text-slate-400" title={dateTime(c.created_at)}>{timeAgo(c.created_at)}</span>
          {c.is_edited && <button type="button" onClick={() => setHistory(true)} className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-600">edited</button>}
          {c.visibility === 'customer_visible' ? <Chip tone="amber"><Eye className="h-3 w-3" /> Customer can see</Chip> : <Chip><Lock className="h-3 w-3" /> Internal</Chip>}
        </div>
        {editing ? (
          <div className="mt-2 space-y-2">
            <TextArea aria-label="Edit comment" value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-20" />
            {save.error && <Notice title="Couldn’t save">{save.error.message}</Notice>}
            <div className="flex gap-2"><Button size="sm" loading={save.isPending} disabled={!draft.trim() || draft === c.body} onClick={() => save.mutate()}>Save</Button><Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(c.body) }}>Cancel</Button></div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{c.body}</p>
        )}
        {!editing && (mine && c.can_edit || canDelete) && (
          <div className="mt-1.5 flex gap-1 text-xs">
            {mine && c.can_edit && <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Pencil className="h-3 w-3" /> Edit</button>}
            {canDelete && <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3 w-3" /> Delete</button>}
          </div>
        )}
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this comment?" description="It will be removed from the conversation. The deletion is recorded in the activity log." confirmLabel="Delete" danger loading={del.isPending} onConfirm={() => del.mutate()} />
      <History comment={c} open={history} onOpenChange={setHistory} />
    </Reveal>
  )
}

export function CommentsPanel({ complaintId }: { complaintId: string }) {
  const slug = useSlug()
  const can = useCan()
  const qc = useQueryClient()
  const { membership } = useMembership()
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<CommentVisibility>('internal')
  const key = [slug, 'comments', complaintId]
  const q = useQuery({ queryKey: key, queryFn: () => api<Page<Comment>>(tenantPath(slug, `comments/${targetQuery(complaintId, { page_size: 100, ordering: '-created_at' })}`)) })
  const post = useMutation({
    mutationFn: () => api(tenantPath(slug, 'comments/'), { method: 'POST', body: { target_type: 'complaint', target_id: complaintId, body, visibility } }),
    onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: [slug, 'activity', complaintId] }); qc.invalidateQueries({ queryKey: [slug, 'counts', complaintId] }) },
  })
  const canWrite = can('comments.create')
  const canCustomer = can('comments.create_customer_visible')
  const submit = () => body.trim() && !post.isPending && post.mutate()

  return (
    <div className="space-y-5">
      {canWrite ? (
        <Card className="p-4">
          <TextArea
            aria-label="Write a comment" placeholder="Write a comment… (Ctrl/⌘ + Enter to send)" value={body} onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }} className="min-h-24 border-0 bg-slate-50/60 ring-0 focus:bg-white"
          />
          {post.error && <div className="mt-3"><Notice title="Couldn’t post your comment">{post.error.message}</Notice></div>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {canCustomer ? (
              <Segmented<CommentVisibility> size="sm" label="Who can see this" value={visibility} onChange={setVisibility} options={[{ value: 'internal', label: 'Internal only' }, { value: 'customer_visible', label: 'Customer can see' }]} />
            ) : <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" /> Visible to your team only</span>}
            <Button disabled={!body.trim()} loading={post.isPending} onClick={submit}><Send className="h-4 w-4" /> Post comment</Button>
          </div>
        </Card>
      ) : <Notice tone="info">You can read comments but don’t have permission to write them.</Notice>}

      <Card>
        {q.isLoading ? <ListSkeleton rows={3} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : q.data!.results.length === 0 ? (
          <EmptyPanel icon={<MessageSquare className="h-6 w-6" />} title="No comments yet" hint="Use comments to share findings and decisions with your team." />
        ) : (
          <ul className="space-y-6 p-5">{q.data!.results.map((c, i) => <Item key={c.id} c={c} index={i} myId={membership?.id} queryKey={key} />)}</ul>
        )}
      </Card>
    </div>
  )
}
