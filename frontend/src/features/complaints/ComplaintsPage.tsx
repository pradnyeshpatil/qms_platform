import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { Badge, Card, CardContent, CardHeader, EmptyState, ErrorState, Loading, Pager, Table, Td, Th } from '@/components/ui/misc'
import { api, ApiError, tenantPath } from '@/lib/api'
import { SEVERITIES, STATUSES, STATUS_LABEL, type Complaint, type Customer, type Page } from '@/lib/types'
import { useMe } from '@/features/auth/auth'
import { PageHeader, useSlug } from '@/layout/AppLayout'
import { SeverityBadge, StatusBadge } from './shared'

const schema = z.object({
  customer: z.string().min(1, 'Choose a customer'),
  title: z.string().min(1, 'Required'),
  description: z.string(),
  product_name: z.string(),
  part_number: z.string(),
  severity: z.enum(SEVERITIES),
  due_date: z.string(),
  assign_to_me: z.boolean(),
})
type Values = z.infer<typeof schema>

function ComplaintForm({ onDone }: { onDone: () => void }) {
  const slug = useSlug()
  const qc = useQueryClient()
  const nav = useNavigate()
  const { data: me } = useMe()
  const myMembership = me?.memberships.find((m) => m.company.slug === slug)
  const customers = useQuery({
    queryKey: [slug, 'customers', 'options'],
    queryFn: () => api<Page<Customer>>(tenantPath(slug, 'customers/?status=active&page_size=100')),
  })
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { customer: '', title: '', description: '', product_name: '', part_number: '', severity: 'minor', due_date: '', assign_to_me: true },
  })
  const m = useMutation({
    mutationFn: ({ assign_to_me, due_date, ...v }: Values) =>
      api<Complaint>(tenantPath(slug, 'complaints/'), {
        method: 'POST',
        body: { ...v, due_date: due_date || null, owner: assign_to_me ? myMembership?.id : null },
      }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: [slug, 'complaints'] })
      qc.invalidateQueries({ queryKey: [slug, 'dashboard'] })
      nav(`/${slug}/complaints/${c.id}`)
    },
    onError: (e) => {
      if (e instanceof ApiError) for (const [k, msg] of Object.entries(e.fieldErrors)) form.setError(k as keyof Values, { message: msg })
    },
  })
  const { errors } = form.formState
  const r = form.register
  const noCustomers = customers.data && customers.data.results.length === 0
  return (
    <Card className="mb-6">
      <CardHeader>New complaint</CardHeader>
      <CardContent>
        {noCustomers ? (
          <EmptyState title="Create a customer first" hint="Complaints are linked to a customer." action={<Button asChild><Link to={`/${slug}/customers`}>Go to customers</Link></Button>} />
        ) : (
          <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer" error={errors.customer?.message}>
              <Select {...r('customer')}>
                <option value="">Select…</option>
                {customers.data?.results.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Title" error={errors.title?.message}><Input {...r('title')} /></Field>
            <Field label="Product name" error={errors.product_name?.message}><Input {...r('product_name')} /></Field>
            <Field label="Part number" error={errors.part_number?.message}><Input {...r('part_number')} /></Field>
            <Field label="Severity" error={errors.severity?.message}>
              <Select {...r('severity')}>{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
            </Field>
            <Field label="Due date" error={errors.due_date?.message}><Input type="date" {...r('due_date')} /></Field>
            <div className="sm:col-span-2"><Field label="Description" error={errors.description?.message}><Textarea {...r('description')} /></Field></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" {...r('assign_to_me')} /> Assign to me</label>
            {m.error && !(m.error instanceof ApiError && Object.keys(m.error.fieldErrors).length) && <p role="alert" className="text-sm text-destructive sm:col-span-2">{m.error.message}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={m.isPending}>{m.isPending ? 'Saving…' : 'Create complaint'}</Button>
              <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

export function ComplaintsPage() {
  const slug = useSlug()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [severity, setSeverity] = useState('')
  const [overdue, setOverdue] = useState(false)
  const [page, setPage] = useState(1)
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1) }
  const qs = new URLSearchParams({ page: String(page), search, status, severity })
  if (overdue) qs.set('overdue', 'true')
  const q = useQuery({
    queryKey: [slug, 'complaints', qs.toString()],
    queryFn: () => api<Page<Complaint>>(tenantPath(slug, `complaints/?${qs}`)),
    placeholderData: (prev) => prev,
  })
  const filtered = search || status || severity || overdue
  return (
    <>
      <PageHeader title="Complaints" actions={<Button onClick={() => setShowForm(true)}>New complaint</Button>} />
      {showForm && <ComplaintForm onDone={() => setShowForm(false)} />}
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <Input placeholder="Search number, title, part, customer…" value={search} onChange={(e) => reset(setSearch)(e.target.value)} className="max-w-xs" />
          <Select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className="w-48">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
          <Select value={severity} onChange={(e) => reset(setSeverity)(e.target.value)} className="w-40">
            <option value="">All severities</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={overdue} onChange={(e) => reset(setOverdue)(e.target.checked)} /> Overdue only</label>
        </div>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data!.results.length === 0 ? (
          <EmptyState title={filtered ? 'No complaints match your filters' : 'No complaints yet'} hint={filtered ? undefined : 'Log your first customer complaint.'} />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Number</Th><Th>Title</Th><Th>Customer</Th><Th>Severity</Th><Th>Status</Th><Th>Due</Th><Th>Owner</Th></tr></thead>
              <tbody>
                {q.data!.results.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/50">
                    <Td className="font-mono"><Link className="text-primary underline" to={`/${slug}/complaints/${c.id}`}>{c.number}</Link></Td>
                    <Td className="font-medium">{c.title}</Td><Td>{c.customer_name}</Td>
                    <Td><SeverityBadge s={c.severity} /></Td><Td><StatusBadge s={c.status} /></Td>
                    <Td>{c.due_date ?? '—'} {c.is_overdue && <Badge tone="red">overdue</Badge>}</Td>
                    <Td>{c.owner_name ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={page} count={q.data!.count} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
