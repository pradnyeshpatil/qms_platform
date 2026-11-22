import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form-controls'
import { Badge, Card, CardContent, CardHeader, EmptyState, ErrorState, Loading, Pager, Table, Td, Th } from '@/components/ui/misc'
import { api, ApiError, tenantPath } from '@/lib/api'
import type { Customer, Page } from '@/lib/types'
import { PageHeader, useSlug } from '@/layout/AppLayout'

const schema = z.object({
  name: z.string().min(1, 'Required'),
  contact_person: z.string(),
  email: z.string().email('Enter a valid email').or(z.literal('')),
  phone: z.string(),
  country: z.string(),
})
type Values = z.infer<typeof schema>

function CustomerForm({ onDone }: { onDone: () => void }) {
  const slug = useSlug()
  const qc = useQueryClient()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', contact_person: '', email: '', phone: '', country: '' } })
  const m = useMutation({
    mutationFn: (v: Values) => api<Customer>(tenantPath(slug, 'customers/'), { method: 'POST', body: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [slug, 'customers'] }); onDone() },
    onError: (e) => {
      if (e instanceof ApiError) for (const [k, msg] of Object.entries(e.fieldErrors)) form.setError(k as keyof Values, { message: msg })
    },
  })
  const { errors } = form.formState
  const r = form.register
  return (
    <Card className="mb-6">
      <CardHeader>New customer</CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name?.message}><Input {...r('name')} /></Field>
          <Field label="Contact person" error={errors.contact_person?.message}><Input {...r('contact_person')} /></Field>
          <Field label="Email" error={errors.email?.message}><Input type="email" {...r('email')} /></Field>
          <Field label="Phone" error={errors.phone?.message}><Input {...r('phone')} /></Field>
          <Field label="Country" error={errors.country?.message}><Input {...r('country')} /></Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" disabled={m.isPending}>{m.isPending ? 'Saving…' : 'Create customer'}</Button>
            <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function CustomersPage() {
  const slug = useSlug()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const q = useQuery({
    queryKey: [slug, 'customers', search, page],
    queryFn: () => api<Page<Customer>>(tenantPath(slug, `customers/?page=${page}&search=${encodeURIComponent(search)}`)),
    placeholderData: (prev) => prev,
  })
  return (
    <>
      <PageHeader title="Customers" actions={<Button onClick={() => setShowForm(true)}>New customer</Button>} />
      {showForm && <CustomerForm onDone={() => setShowForm(false)} />}
      <Card>
        <div className="border-b border-border p-4">
          <Input placeholder="Search name, contact, email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="max-w-sm" />
        </div>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data!.results.length === 0 ? (
          <EmptyState title={search ? 'No customers match your search' : 'No customers yet'} hint={search ? undefined : 'Add your first customer to start logging complaints.'} />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Name</Th><Th>Contact</Th><Th>Email</Th><Th>Phone</Th><Th>Country</Th><Th>Status</Th></tr></thead>
              <tbody>
                {q.data!.results.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium">{c.name}</Td><Td>{c.contact_person}</Td><Td>{c.email}</Td><Td>{c.phone}</Td><Td>{c.country}</Td>
                    <Td><Badge tone={c.status === 'active' ? 'green' : 'gray'}>{c.status}</Badge></Td>
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
