import { FormField, SelectInput, TextArea, TextInput } from '@/components/kit/inputs'
import type { Employee } from '@/lib/types'
import type { Field } from './sections'

export type Values = Record<string, unknown>
export const employeeName = (m: Employee) => `${m.first_name} ${m.last_name}`.trim() || m.email || m.username || 'Unnamed'

/** Editable copy of a record: every field as something an input can hold. */
export function toValues(fields: Field[], source: Values | undefined): Values {
  const out: Values = {}
  for (const f of fields) {
    const v = source?.[f.key]
    if (f.kind === 'bool') out[f.key] = Boolean(v)
    else if (f.kind === 'tri') out[f.key] = v === true ? 'true' : v === false ? 'false' : ''
    else out[f.key] = v === null || v === undefined ? (f.kind === 'select' ? f.options?.[0]?.[0] ?? '' : '') : String(v)
  }
  return out
}

/** API body from edited values (empty dates/numbers/members become null). */
export function toBody(fields: Field[], values: Values): Values {
  const out: Values = {}
  for (const f of fields) {
    const v = values[f.key]
    if (f.kind === 'bool') out[f.key] = Boolean(v)
    else if (f.kind === 'tri') out[f.key] = v === 'true' ? true : v === 'false' ? false : null
    else if (f.kind === 'number') out[f.key] = v === '' ? null : Number(v)
    else if (f.kind === 'date' || f.kind === 'member') out[f.key] = v === '' ? null : v
    else out[f.key] = v
  }
  return out
}

export function changedKeys(fields: Field[], a: Values, b: Values): string[] {
  return fields.filter((f) => a[f.key] !== b[f.key]).map((f) => f.key)
}

export function FieldInput({ field, value, onChange, people, disabled, error, idPrefix = 'f' }: {
  field: Field; value: unknown; onChange: (v: unknown) => void; people: Employee[] | undefined; disabled?: boolean; error?: string; idPrefix?: string
}) {
  const id = `${idPrefix}-${field.key}`
  if (field.kind === 'bool') {
    return (
      <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-slate-700">
        <input id={id} type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    )
  }
  if (field.kind === 'member' && !people) return null // needs users.view; the field simply isn't offered
  const v = String(value ?? '')
  const control =
    field.kind === 'textarea' ? <TextArea id={id} className="min-h-24" value={v} disabled={disabled} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} />
    : field.kind === 'select' ? <SelectInput id={id} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)}>{field.options!.map(([val, label]) => <option key={val} value={val}>{label}</option>)}</SelectInput>
    : field.kind === 'tri' ? <SelectInput id={id} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)}><option value="">Not assessed</option><option value="true">Yes</option><option value="false">No</option></SelectInput>
    : field.kind === 'member' ? <SelectInput id={id} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)}><option value="">Nobody</option>{people!.map((p) => <option key={p.id} value={p.id}>{employeeName(p)}</option>)}</SelectInput>
    : <TextInput id={id} type={field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'} min={field.kind === 'number' ? 0 : undefined} value={v} disabled={disabled} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} />
  return <FormField label={field.label} htmlFor={id} hint={field.hint} optional={field.optional} error={error}>{control}</FormField>
}
