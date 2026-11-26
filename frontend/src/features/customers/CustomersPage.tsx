import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Avatar } from '@/components/kit/avatar'
import { Button } from '@/components/kit/button'
import { Card, PageTitle } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton, Notice } from '@/components/kit/feedback'
import { FormField, TextInput } from '@/components/kit/inputs'
import { Drawer } from '@/components/kit/overlay'
import { Chip } from '@/components/kit/pills'
import { Pager, Table, Td, Th } from '@/components/kit/table'
import { api, ApiError, tenantPath } from '@/lib/api'
import type { Customer, Page } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSlug } from '@/layout/AppLayout'

const schema = z.object({
  name: z.string().min(1, 'Required'),
  contact_person: z.string(),
  email: z.string().email('Enter a valid email').or(z.literal('')),
  phone: z.string(),
  country: z.string(),
})
type Values = z.infer<typeof schema>
const FORM_ID = 'customer-form'

function CustomerDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const slug = useSlug()
  const qc = useQueryClient()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', contact_person: '', email: '', phone: '', country: '' } })
  const m = useMutation({
    mutationFn: (v: Values) => api<Customer>(tenantPath(slug, 'customers/'), { method: 'POST', body: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [slug, 'customers'] }); form.reset(); onOpenChange(false); toast.success('Customer added') },
    onError: (e) => {
      if (e instanceof ApiError) for (const [k, msg] of Object.entries(e.fieldErrors)) form.setError(k as keyof Values, { message: msg })
    },
  })
  const { errors } = form.formState
  const r = form.register
  const general = m.error && !(m.error instanceof ApiError && Object.keys(m.error.fieldErrors).length) ? m.error.message : ''
  return (
    <Drawer
      open={open} onOpenChange={onOpenChange} title="New customer" description="Customers are who your complaints are logged against."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form={FORM_ID} loading={m.isPending}>Create customer</Button></>}
    >
      <form id={FORM_ID} onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-5">
        <FormField label="Name" htmlFor="c-name" error={errors.name?.message}><TextInput id="c-name" aria-invalid={!!errors.name} {...r('name')} /></FormField>
        <FormField label="Contact person" htmlFor="c-contact" optional error={errors.contact_person?.message}><TextInput id="c-contact" {...r('contact_person')} /></FormField>
        <FormField label="Email" htmlFor="c-email" optional error={errors.email?.message}><TextInput id="c-email" type="email" aria-invalid={!!errors.email} {...r('email')} /></FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Phone" htmlFor="c-phone" optional error={errors.phone?.message}><TextInput id="c-phone" {...r('phone')} /></FormField>
          <FormField label="Country" htmlFor="c-country" optional error={errors.country?.message}><TextInput id="c-country" {...r('country')} /></FormField>
        </div>
        {general && <Notice title="Couldn’t save">{general}</Notice>}
      </form>
    </Drawer>
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
      <PageTitle title="Customers" subtitle="The companies and people you receive complaints from." actions={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New customer</Button>} />
      <CustomerDrawer open={showForm} onOpenChange={setShowForm} />
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="max-w-sm"><TextInput aria-label="Search customers" icon={<Search className="h-4 w-4" />} placeholder="Search name, contact, email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} /></div>
        </div>
        {q.isLoading ? <ListSkeleton rows={6} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : q.data!.results.length === 0 ? (
          <EmptyPanel
            icon={<Users className="h-6 w-6" />}
            title={search ? 'No customers match your search' : 'No customers yet'}
            hint={search ? 'Try a different name or email.' : 'Add your first customer to start logging complaints.'}
            action={!search && <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New customer</Button>}
          />
        ) : (
          <div className={cn('transition-opacity', q.isPlaceholderData && 'opacity-60')}>
            <Table>
              <thead><tr><Th>Name</Th><Th>Contact</Th><Th>Email</Th><Th>Phone</Th><Th>Country</Th><Th>Status</Th></tr></thead>
              <tbody>
                {q.data!.results.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-slate-50/70">
                    <Td><span className="flex items-center gap-3"><Avatar name={c.name} /><span className="font-medium text-slate-900">{c.name}</span></span></Td>
                    <Td>{c.contact_person || '—'}</Td><Td>{c.email || '—'}</Td><Td>{c.phone || '—'}</Td><Td>{c.country || '—'}</Td>
                    <Td><Chip tone={c.status === 'active' ? 'emerald' : 'slate'} className="capitalize">{c.status}</Chip></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="border-t border-slate-100"><Pager page={page} count={q.data!.count} noun="customer" onPage={setPage} /></div>
          </div>
        )}
      </Card>
    </>
  )
}
