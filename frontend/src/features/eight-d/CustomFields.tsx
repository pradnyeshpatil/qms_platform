import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/kit/button'
import { Card, CardHeading } from '@/components/kit/card'
import { Notice } from '@/components/kit/feedback'
import { FormField, SelectInput, TextArea, TextInput } from '@/components/kit/inputs'
import { api, ApiError, tenantPath } from '@/lib/api'
import { isConflict, useRefreshReport } from './api'
import { useSlug } from '@/layout/AppLayout'
import type { CustomFieldDef, CustomSchemaEntry } from './types'

type Data = Record<string, unknown>

/** What an input holds for a stored JSON value. */
const toInput = (d: CustomFieldDef, v: unknown): unknown => {
  if (d.field_type === 'checkbox') return Boolean(v ?? d.default)
  if (d.field_type === 'multiselect') return Array.isArray(v) ? v : []
  if (d.field_type === 'yes_no') return v === true ? 'true' : v === false ? 'false' : ''
  return v === null || v === undefined ? (d.default === null || d.default === undefined ? '' : String(d.default)) : String(v)
}
/** JSON value to send for an input value (empty clears). */
const toApi = (d: CustomFieldDef, v: unknown): unknown => {
  if (d.field_type === 'checkbox' || d.field_type === 'multiselect') return v
  if (d.field_type === 'yes_no') return v === 'true' ? true : v === 'false' ? false : null
  return v === '' ? null : v
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function Input({ d, value, onChange, disabled, error }: { d: CustomFieldDef; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; error?: string }) {
  const id = `cf-${d.section || 'report'}-${d.key}`
  const label = d.label
  if (d.field_type === 'checkbox') {
    return (
      <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-slate-700">
        <input id={id} type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {label}{d.required && <span className="text-rose-500" aria-hidden>*</span>}
      </label>
    )
  }
  const v = String(value ?? '')
  const optional = !d.required
  let control
  if (d.field_type === 'multiselect') {
    const chosen = Array.isArray(value) ? (value as string[]) : []
    control = (
      <div className="space-y-1.5 rounded-xl p-3 ring-1 ring-slate-200" role="group" aria-label={label}>
        {d.options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" disabled={disabled} checked={chosen.includes(o.value)}
              onChange={() => onChange(chosen.includes(o.value) ? chosen.filter((x) => x !== o.value) : [...chosen, o.value])} />
            {o.label}
          </label>
        ))}
      </div>
    )
  } else if (d.field_type === 'dropdown') {
    control = <SelectInput id={id} value={v} disabled={disabled} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)}><option value="">Choose…</option>{d.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</SelectInput>
  } else if (d.field_type === 'yes_no') {
    control = <SelectInput id={id} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)}><option value="">Not answered</option><option value="true">Yes</option><option value="false">No</option></SelectInput>
  } else if (d.field_type === 'textarea') {
    control = <TextArea id={id} className="min-h-24" value={v} disabled={disabled} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} />
  } else {
    control = <TextInput id={id} type={d.field_type === 'date' ? 'date' : 'text'} inputMode={d.field_type === 'integer' ? 'numeric' : d.field_type === 'decimal' ? 'decimal' : undefined} value={v} disabled={disabled} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} />
  }
  return <FormField label={label} htmlFor={id} hint={d.help_text || undefined} optional={optional} error={error}>{control}</FormField>
}

/** Read-only display of a stored value using the definition it was saved under. */
function readValue(entry: CustomSchemaEntry, v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => entry.options.find((o) => o.value === x)?.label ?? String(x)).join(', ')
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (entry.type === 'dropdown') return entry.options.find((o) => o.value === v)?.label ?? String(v)
  return String(v)
}

/**
 * The company's extra fields for the report header (`section=''`) or one section.
 * Values of fields that were deactivated since are still shown, read-only.
 */
export function CustomFieldsCard({ reportId, section, defs, data, schema, version, canEdit, title }: {
  reportId: string; section: string; defs: CustomFieldDef[]; data: Data; schema: Record<string, CustomSchemaEntry>
  version: number; canEdit: boolean; title?: string
}) {
  const slug = useSlug()
  const refresh = useRefreshReport()
  const scoped = defs.filter((d) => d.section === section && d.is_active).sort((a, b) => a.sort_order - b.sort_order)
  const base: Data = Object.fromEntries(scoped.map((d) => [d.key, toInput(d, data[d.key])]))
  const [values, setValues] = useState<Data>(base)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState(false)
  const sig = JSON.stringify(base)
  useEffect(() => { setValues(JSON.parse(sig)); setErrors({}); setConflict(false) }, [sig, version])
  const changed = scoped.filter((d) => !same(values[d.key], base[d.key]))
  const retired = Object.keys(data).filter((k) => !scoped.some((d) => d.key === k) && schema[k])
  const save = useMutation({
    mutationFn: () => {
      const custom_data = Object.fromEntries(changed.map((d) => [d.key, toApi(d, values[d.key])]))
      return section
        ? api(tenantPath(slug, `eight-d-reports/${reportId}/sections/${section}/custom/`), { method: 'POST', body: { custom_data, version } })
        : api(tenantPath(slug, `eight-d-reports/${reportId}/`), { method: 'PATCH', body: { custom_data, version } })
    },
    onSuccess: () => { setErrors({}); refresh(); toast.success('Saved') },
    onError: (e: Error) => {
      if (isConflict(e)) return setConflict(true)
      if (e instanceof ApiError && e.isFieldValidation) return setErrors(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, m]) => [k.replace('custom_data.', ''), m])))
      toast.error(e.message)
    },
  })
  if (!scoped.length && !retired.length) return null
  return (
    <Card>
      <CardHeading title={title ?? 'Additional fields'} hint="Defined by your company for its 8D reports." />
      <div className="space-y-4 px-5 pb-5 pt-3">
        {conflict && <Notice tone="warning" title="Someone else saved this first">Reload to see their changes. <button type="button" className="font-semibold underline" onClick={() => { refresh(); setConflict(false) }}>Reload now</button></Notice>}
        {scoped.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {scoped.map((d) => (
              <div key={d.key} className={d.field_type === 'textarea' || d.field_type === 'multiselect' ? 'sm:col-span-2' : undefined}>
                <Input d={d} value={values[d.key]} disabled={!canEdit} error={errors[d.key]} onChange={(v) => setValues((s) => ({ ...s, [d.key]: v }))} />
              </div>
            ))}
          </div>
        )}
        {retired.length > 0 && (
          <dl className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200/70">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Earlier fields (no longer in use)</p>
            {retired.map((k) => <div key={k} className="flex justify-between gap-4 py-0.5"><dt className="text-slate-500">{schema[k].label}</dt><dd className="text-slate-800">{readValue(schema[k], data[k])}</dd></div>)}
          </dl>
        )}
        {canEdit && scoped.length > 0 && (
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" disabled={!changed.length} onClick={() => setValues(base)}>Discard changes</Button>
            <Button loading={save.isPending} disabled={!changed.length} onClick={() => save.mutate()}>Save fields</Button>
          </div>
        )}
      </div>
    </Card>
  )
}
