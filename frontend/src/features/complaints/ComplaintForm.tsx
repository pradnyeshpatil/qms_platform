import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/kit/button'
import { Notice } from '@/components/kit/feedback'
import { FormField, SelectInput, TextArea, TextInput } from '@/components/kit/inputs'
import { Drawer } from '@/components/kit/overlay'
import { SEVERITY_STYLE } from '@/components/kit/theme'
import { api, ApiError, qs, tenantPath } from '@/lib/api'
import { SEVERITIES, SOURCES, SOURCE_LABEL, type Complaint, type Customer, type Page } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useCan } from '@/features/auth/auth'
import { useSlug } from '@/layout/AppLayout'
import { useDefectCategories, useEmployeeOptions, useRefreshComplaint } from './api'

const schema = z.object({
  customer: z.string().min(1, 'Choose a customer'),
  title: z.string().trim().min(1, 'Give the complaint a short title'),
  description: z.string(),
  product_name: z.string(),
  part_number: z.string(),
  batch_number: z.string(),
  quantity_affected: z.string().refine((v) => v === '' || /^\d+$/.test(v), 'Use a whole number'),
  defect_category: z.string(),
  severity: z.enum(SEVERITIES),
  source: z.enum(SOURCES),
  customer_reference_number: z.string(),
  reported_date: z.string(),
  due_date: z.string(),
  owner: z.string(),
})
type Values = z.infer<typeof schema>

const SEVERITY_HELP: Record<(typeof SEVERITIES)[number], string> = {
  minor: 'Cosmetic or low impact', major: 'Affects function or fit', critical: 'Safety risk or line stopped',
}

const emptyValues: Values = {
  customer: '', title: '', description: '', product_name: '', part_number: '', batch_number: '', quantity_affected: '',
  defect_category: '', severity: 'minor', source: 'email', customer_reference_number: '', reported_date: '', due_date: '', owner: '',
}

const fromComplaint = (c: Complaint): Values => ({
  customer: c.customer, title: c.title, description: c.description, product_name: c.product_name, part_number: c.part_number,
  batch_number: c.batch_number, quantity_affected: c.quantity_affected?.toString() ?? '', defect_category: c.defect_category ?? '',
  severity: c.severity, source: c.source, customer_reference_number: c.customer_reference_number,
  reported_date: c.reported_date ?? '', due_date: c.due_date ?? '', owner: c.owner ?? '',
})

function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{children}</h3>
}

/** Create (no `complaint`) or edit (with `complaint`) in a slide-over. */
export function ComplaintFormDrawer({ open, onOpenChange, complaint }: { open: boolean; onOpenChange: (o: boolean) => void; complaint?: Complaint }) {
  const slug = useSlug()
  const nav = useNavigate()
  const can = useCan()
  const refresh = useRefreshComplaint()
  const editing = !!complaint
  const canAssign = can('complaints.assign')

  const customers = useQuery({
    queryKey: [slug, 'customers', 'options', 'active'], enabled: open,
    queryFn: () => api<Page<Customer>>(tenantPath(slug, 'customers/?status=active&page_size=100')),
  })
  const defects = useDefectCategories()
  const employees = useEmployeeOptions(open && canAssign && !editing)

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: complaint ? fromComplaint(complaint) : emptyValues })
  const { errors } = form.formState
  const r = form.register
  useEffect(() => { if (open) form.reset(complaint ? fromComplaint(complaint) : emptyValues) }, [open, complaint, form])

  const severity = useWatch({ control: form.control, name: 'severity' })
  const customer = useWatch({ control: form.control, name: 'customer' })
  const part = useDebounced(useWatch({ control: form.control, name: 'part_number' }).trim())
  const batch = useDebounced(useWatch({ control: form.control, name: 'batch_number' }).trim())
  const dupes = useQuery({
    queryKey: [slug, 'duplicates', customer, part, batch], enabled: open && !editing && !!customer && !!part,
    queryFn: () => api<{ results: { id: string; number: string; title: string }[] }>(tenantPath(slug, `complaints/duplicates/${qs({ customer, part_number: part, batch_number: batch })}`)),
  })

  const save = useMutation({
    mutationFn: (v: Values) => {
      const { owner, ...rest } = v // the owner is set at creation only; later changes go through "Assign"
      const body = {
        ...rest,
        quantity_affected: v.quantity_affected === '' ? null : Number(v.quantity_affected),
        defect_category: v.defect_category || null, due_date: v.due_date || null, reported_date: v.reported_date || null,
        ...(editing ? {} : { owner: owner || null }),
      }
      return api<Complaint>(tenantPath(slug, editing ? `complaints/${complaint!.id}/` : 'complaints/'), { method: editing ? 'PATCH' : 'POST', body })
    },
    onSuccess: (c) => {
      refresh(c)
      onOpenChange(false)
      toast.success(editing ? 'Changes saved' : `Complaint ${c.number} created`)
      if (!editing) nav(`/${slug}/complaints/${c.id}`)
    },
    onError: (e) => {
      if (e instanceof ApiError) for (const [k, msg] of Object.entries(e.fieldErrors)) form.setError(k as keyof Values, { message: msg })
    },
  })
  const formError = save.error instanceof ApiError && !save.error.isFieldValidation ? save.error.message : save.error && !(save.error instanceof ApiError) ? 'Something went wrong. Please try again.' : ''
  const noCustomers = customers.data && customers.data.results.length === 0

  return (
    <Drawer
      open={open} onOpenChange={onOpenChange}
      title={editing ? `Edit ${complaint!.number}` : 'New complaint'}
      description={editing ? 'Update the details. Changes are recorded in the activity log.' : 'Tell us what happened. You can add files and comments after saving.'}
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" form="complaint-form" loading={save.isPending}>{editing ? 'Save changes' : 'Create complaint'}</Button>
      </>}
    >
      {noCustomers ? (
        <Notice tone="info" title="Add a customer first">Complaints are linked to a customer. <Link className="font-medium underline" to={`/${slug}/customers`}>Go to customers</Link></Notice>
      ) : (
        <form id="complaint-form" onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-5" noValidate>
          {formError && <Notice title="Couldn’t save">{formError}</Notice>}

          <div>
            <SectionLabel>What happened</SectionLabel>
            <div className="space-y-4">
              <FormField label="Customer" htmlFor="f-customer" error={errors.customer?.message}>
                <SelectInput id="f-customer" aria-invalid={!!errors.customer} {...r('customer')}>
                  <option value="">Select a customer…</option>
                  {customers.data?.results.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectInput>
              </FormField>
              <FormField label="Title" htmlFor="f-title" error={errors.title?.message}>
                <TextInput id="f-title" placeholder="e.g. Burrs found on machined flanges" aria-invalid={!!errors.title} {...r('title')} />
              </FormField>
              <FormField label="Description" htmlFor="f-desc" optional error={errors.description?.message}>
                <TextArea id="f-desc" placeholder="What was found, where, and how many? Anything the team should know." {...r('description')} />
              </FormField>
            </div>
          </div>

          <div>
            <SectionLabel>How serious is it?</SectionLabel>
            <div role="radiogroup" aria-label="Severity" className="grid grid-cols-3 gap-2.5">
              {SEVERITIES.map((s) => {
                const active = severity === s
                return (
                  <label key={s} className={cn('cursor-pointer rounded-2xl p-3 ring-1 transition focus-within:ring-2 focus-within:ring-indigo-500/60', active ? 'bg-indigo-50/70 ring-2 ring-indigo-500' : 'bg-white ring-slate-200 hover:ring-slate-300')}>
                    <input type="radio" value={s} className="sr-only" {...r('severity')} />
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><span className={cn('h-2 w-2 rounded-full', SEVERITY_STYLE[s].dot)} />{SEVERITY_STYLE[s].label}</span>
                    <span className="mt-1 block text-xs leading-snug text-slate-500">{SEVERITY_HELP[s]}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <SectionLabel>Product details</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Product" htmlFor="f-product" optional><TextInput id="f-product" {...r('product_name')} /></FormField>
              <FormField label="Part number" htmlFor="f-part" optional><TextInput id="f-part" {...r('part_number')} /></FormField>
              <FormField label="Batch / lot" htmlFor="f-batch" optional><TextInput id="f-batch" {...r('batch_number')} /></FormField>
              <FormField label="Quantity affected" htmlFor="f-qty" optional error={errors.quantity_affected?.message}>
                <TextInput id="f-qty" inputMode="numeric" placeholder="e.g. 12" aria-invalid={!!errors.quantity_affected} {...r('quantity_affected')} />
              </FormField>
              <FormField label="Defect type" htmlFor="f-defect" optional error={errors.defect_category?.message}>
                <SelectInput id="f-defect" {...r('defect_category')}>
                  <option value="">Not specified</option>
                  {defects.data?.filter((d) => d.is_active || d.id === complaint?.defect_category).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </SelectInput>
              </FormField>
              <FormField label="Reported via" htmlFor="f-source">
                <SelectInput id="f-source" {...r('source')}>{SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</SelectInput>
              </FormField>
            </div>
            {dupes.data && dupes.data.results.length > 0 && (
              <div className="mt-4 animate-rise rounded-xl bg-amber-50 p-3.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200" role="status">
                <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden /> Possible duplicate</p>
                <p className="mt-0.5 text-amber-800">Open complaints already exist for this customer, part and batch. You can still continue.</p>
                <ul className="mt-2 space-y-1">
                  {dupes.data.results.map((d) => <li key={d.id}><Link target="_blank" rel="noreferrer" className="font-medium underline" to={`/${slug}/complaints/${d.id}`}>{d.number}</Link> · {d.title}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div>
            <SectionLabel>Planning</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Due date" htmlFor="f-due" optional><TextInput id="f-due" type="date" {...r('due_date')} /></FormField>
              <FormField label="Reported on" htmlFor="f-rep" optional hint="Defaults to today"><TextInput id="f-rep" type="date" {...r('reported_date')} /></FormField>
              <FormField label="Customer’s reference no." htmlFor="f-ref" optional className="sm:col-span-2"><TextInput id="f-ref" placeholder="The customer’s own complaint ID" {...r('customer_reference_number')} /></FormField>
              {!editing && canAssign && (
                <FormField label="Owner" htmlFor="f-owner" optional className="sm:col-span-2" hint="The person responsible. You can change this later.">
                  <SelectInput id="f-owner" {...r('owner')}>
                    <option value="">Unassigned</option>
                    {employees.data?.map((m) => <option key={m.id} value={m.id}>{`${m.first_name} ${m.last_name}`.trim() || m.email || m.username}</option>)}
                  </SelectInput>
                </FormField>
              )}
            </div>
          </div>
        </form>
      )}
    </Drawer>
  )
}
