import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/kit/button'
import { Card, PageTitle } from '@/components/kit/card'
import { EmptyPanel, ErrorPanel, ListSkeleton, Notice } from '@/components/kit/feedback'
import { FormField, SelectInput, Switch, TextInput } from '@/components/kit/inputs'
import { Modal } from '@/components/kit/overlay'
import { Chip } from '@/components/kit/pills'
import { api, ApiError, tenantPath } from '@/lib/api'
import { RequirePermission } from '@/features/auth/auth'
import { useCustomFields } from '@/features/eight-d/api'
import { SECTIONS } from '@/features/eight-d/sections'
import { CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABEL, type CustomFieldDef, type CustomFieldOption, type CustomFieldType } from '@/features/eight-d/types'
import { useSlug } from '@/layout/AppLayout'

const SCOPES: { value: string; label: string }[] = [{ value: '', label: 'Report details (top of the report)' }, ...SECTIONS.map((s) => ({ value: s.code, label: `${s.code} · ${s.title}` }))]
const slugKey = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 50)

type Form = { label: string; key: string; field_type: CustomFieldType; section: string; required: boolean; show_in_pdf: boolean; is_active: boolean; help_text: string; options: CustomFieldOption[]; min: string; max: string; max_length: string; regex: string }
const blank = (section: string): Form => ({ label: '', key: '', field_type: 'text', section, required: false, show_in_pdf: true, is_active: true, help_text: '', options: [{ value: '', label: '' }], min: '', max: '', max_length: '', regex: '' })
const fromDef = (d: CustomFieldDef): Form => ({ label: d.label, key: d.key, field_type: d.field_type, section: d.section, required: d.required, show_in_pdf: d.show_in_pdf, is_active: d.is_active, help_text: d.help_text, options: d.options.length ? d.options : [{ value: '', label: '' }], min: d.validation.min?.toString() ?? '', max: d.validation.max?.toString() ?? '', max_length: d.validation.max_length?.toString() ?? '', regex: d.validation.regex ?? '' })

function FieldModal({ def, section, open, onOpenChange }: { def: CustomFieldDef | null; section: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const slug = useSlug()
  const qc = useQueryClient()
  const [f, setF] = useState<Form>(blank(section))
  const [keyTouched, setKeyTouched] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  useEffect(() => { if (open) { setF(def ? fromDef(def) : blank(section)); setKeyTouched(false); setErrors({}) } }, [open, def, section])
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }))
  const choice = f.field_type === 'dropdown' || f.field_type === 'multiselect'
  const numeric = f.field_type === 'integer' || f.field_type === 'decimal'
  const text = f.field_type === 'text' || f.field_type === 'textarea'
  const body = () => {
    const validation: Record<string, unknown> = {}
    if (numeric && f.min !== '') validation.min = Number(f.min)
    if (numeric && f.max !== '') validation.max = Number(f.max)
    if (text && f.max_length !== '') validation.max_length = Number(f.max_length)
    if (text && f.regex) validation.regex = f.regex
    const base = { label: f.label.trim(), field_type: f.field_type, required: f.required, show_in_pdf: f.show_in_pdf, is_active: f.is_active, help_text: f.help_text, validation, options: choice ? f.options.filter((o) => o.value || o.label).map((o) => ({ value: (o.value || slugKey(o.label)), label: o.label || o.value })) : [] }
    return def ? base : { ...base, entity_type: 'eight_d_report', section: f.section, key: f.key }
  }
  const m = useMutation({
    mutationFn: () => def ? api(tenantPath(slug, `custom-fields/${def.id}/`), { method: 'PATCH', body: body() }) : api(tenantPath(slug, 'custom-fields/'), { method: 'POST', body: body() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [slug, 'custom-fields'] }); onOpenChange(false); toast.success(def ? 'Field updated' : 'Field added') },
    onError: (e: Error) => { if (e instanceof ApiError && e.isFieldValidation) setErrors(e.fieldErrors); else toast.error(e.message) },
  })
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={def ? 'Edit field' : 'Add a field'} description={def ? 'Existing reports keep the values they have. Changes apply to new edits.' : 'Appears on every 8D report, in the place you choose.'}
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={m.isPending} disabled={!f.label.trim() || (!def && !f.key)} onClick={() => m.mutate()}>{def ? 'Save' : 'Add field'}</Button></>}>
      <div className="space-y-4">
        <FormField label="Label" htmlFor="cf-label" error={errors.label}><TextInput id="cf-label" value={f.label} onChange={(e) => { set('label', e.target.value); if (!def && !keyTouched) set('key', slugKey(e.target.value)) }} placeholder="e.g. Customer PO number" /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Type" htmlFor="cf-type" error={errors.field_type}>
            <SelectInput id="cf-type" value={f.field_type} onChange={(e) => set('field_type', e.target.value as CustomFieldType)}>{CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{CUSTOM_FIELD_TYPE_LABEL[t]}</option>)}</SelectInput>
          </FormField>
          <FormField label="Where it appears" htmlFor="cf-section" error={errors.section}>
            <SelectInput id="cf-section" value={f.section} disabled={!!def} onChange={(e) => set('section', e.target.value)}>{SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</SelectInput>
          </FormField>
        </div>
        <FormField label="Internal key" htmlFor="cf-key" error={errors.key} hint={def ? 'Fixed after creation.' : 'Lowercase letters, digits and underscores. Cannot be changed later.'}>
          <TextInput id="cf-key" value={f.key} disabled={!!def} onChange={(e) => { setKeyTouched(true); set('key', e.target.value) }} />
        </FormField>
        <FormField label="Help text" htmlFor="cf-help" optional><TextInput id="cf-help" value={f.help_text} onChange={(e) => set('help_text', e.target.value)} /></FormField>
        {choice && (
          <FormField label="Options" error={errors.options}>
            <ul className="space-y-2">
              {f.options.map((o, i) => (
                <li key={i} className="flex gap-2">
                  <TextInput aria-label={`Option ${i + 1}`} placeholder="Option label" value={o.label} onChange={(e) => set('options', f.options.map((x, j) => j === i ? { ...x, label: e.target.value, value: x.value && j < (def?.options.length ?? 0) ? x.value : slugKey(e.target.value) } : x))} />
                  <Button size="icon" variant="ghost" aria-label={`Remove option ${i + 1}`} disabled={f.options.length === 1} onClick={() => set('options', f.options.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="soft" className="mt-2" onClick={() => set('options', [...f.options, { value: '', label: '' }])}><Plus className="h-3.5 w-3.5" /> Add option</Button>
          </FormField>
        )}
        {numeric && <div className="grid gap-4 sm:grid-cols-2"><FormField label="Minimum" htmlFor="cf-min" optional><TextInput id="cf-min" inputMode="decimal" value={f.min} onChange={(e) => set('min', e.target.value)} /></FormField><FormField label="Maximum" htmlFor="cf-max" optional><TextInput id="cf-max" inputMode="decimal" value={f.max} onChange={(e) => set('max', e.target.value)} /></FormField></div>}
        {text && <div className="grid gap-4 sm:grid-cols-2"><FormField label="Maximum length" htmlFor="cf-len" optional><TextInput id="cf-len" inputMode="numeric" value={f.max_length} onChange={(e) => set('max_length', e.target.value)} /></FormField><FormField label="Format (regex)" htmlFor="cf-re" optional error={errors.validation}><TextInput id="cf-re" value={f.regex} onChange={(e) => set('regex', e.target.value)} placeholder="PO-\d+" /></FormField></div>}
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-slate-800">Required</p><p className="text-xs text-slate-500">Must be filled in before the section can be completed (or the report sent for approval).</p></div><Switch label="Required" checked={f.required} onChange={(v) => set('required', v)} /></div>
          <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-slate-800">Show in PDF</p><p className="text-xs text-slate-500">Included when the report is exported.</p></div><Switch label="Show in PDF" checked={f.show_in_pdf} onChange={(v) => set('show_in_pdf', v)} /></div>
          {def && <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-slate-800">Active</p><p className="text-xs text-slate-500">Turn off to hide it from forms. Values already saved are kept.</p></div><Switch label="Active" checked={f.is_active} onChange={(v) => set('is_active', v)} /></div>}
        </div>
      </div>
    </Modal>
  )
}

export function CustomFieldsPage() {
  const q = useCustomFields(true)
  const [scope, setScope] = useState('')
  const [editing, setEditing] = useState<CustomFieldDef | null>(null)
  const [adding, setAdding] = useState(false)
  const inScope = (q.data ?? []).filter((d) => d.section === scope)
  const count = (s: string) => (q.data ?? []).filter((d) => d.section === s && d.is_active).length
  return (
    <RequirePermission permission="custom_fields.manage">
      <PageTitle title="Custom fields" subtitle="Add the fields and business parameters your company needs on its 8D reports."
        actions={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add field</Button>} />
      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="p-2">
          <ul className="space-y-0.5">
            {SCOPES.map((s) => (
              <li key={s.value || 'report'}>
                <button type="button" aria-current={scope === s.value ? 'page' : undefined} onClick={() => setScope(s.value)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${scope === s.value ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <span className="truncate">{s.label}</span>{count(s.value) > 0 && <Chip tone="indigo">{count(s.value)}</Chip>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          {q.isLoading ? <ListSkeleton rows={3} /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : inScope.length === 0 ? (
            <EmptyPanel icon={<SlidersHorizontal className="h-6 w-6" />} title="No extra fields here yet" hint="Add one for anything your customers or your own process need recorded."
              action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add field</Button>} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {inScope.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${d.is_active ? 'text-slate-900' : 'text-slate-400'}`}>{d.label}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Chip>{CUSTOM_FIELD_TYPE_LABEL[d.field_type]}</Chip><span className="font-mono text-xs text-slate-400">{d.key}</span>
                      {d.required && <Chip tone="amber">Required</Chip>}{!d.show_in_pdf && <Chip>Not in PDF</Chip>}{!d.is_active && <Chip tone="rose">Inactive</Chip>}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>Edit</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {q.isError && <Notice title="Couldn’t load fields">{q.error.message}</Notice>}
      <FieldModal def={editing} section={scope} open={adding || !!editing} onOpenChange={(o) => { if (!o) { setAdding(false); setEditing(null) } }} />
    </RequirePermission>
  )
}
