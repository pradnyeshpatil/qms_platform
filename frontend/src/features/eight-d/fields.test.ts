import { describe, expect, it } from 'vitest'
import { describeActivity } from '@/lib/activity'
import { changedKeys, toBody, toValues } from './fields'
import { ROWS, SECTIONS } from './sections'

const fields = ROWS.D6.fields

describe('8D form values', () => {
  it('turns nulls into inputs and back', () => {
    const v = toValues(fields, { description: 'Run 100', responsible: null, validated_date: null, is_effective: null })
    expect(v.is_effective).toBe('')
    expect(toBody(fields, v)).toMatchObject({ description: 'Run 100', responsible: null, validated_date: null, is_effective: null })
  })
  it('maps the tri-state effectiveness select', () => {
    expect(toBody(fields, { ...toValues(fields, {}), is_effective: 'true' }).is_effective).toBe(true)
    expect(toBody(fields, { ...toValues(fields, {}), is_effective: 'false' }).is_effective).toBe(false)
  })
  it('sends empty numbers as null and keeps zero', () => {
    const f = ROWS.D3.fields
    expect(toBody(f, { ...toValues(f, {}), quantity_checked: '' }).quantity_checked).toBeNull()
    expect(toBody(f, { ...toValues(f, {}), quantity_checked: '0' }).quantity_checked).toBe(0)
  })
  it('detects what changed', () => {
    const a = toValues(fields, { description: 'a' })
    expect(changedKeys(fields, a, { ...a, description: 'b' })).toEqual(['description'])
    expect(changedKeys(fields, a, a)).toEqual([])
  })
})

describe('8D structure', () => {
  it('covers D0 to D8 once, with a form for every list section', () => {
    expect(SECTIONS.map((s) => s.code)).toEqual(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'])
    for (const s of SECTIONS) expect(Boolean(s.single) || Boolean(ROWS[s.code])).toBe(true)
  })
})

describe('8D activity wording', () => {
  it('describes workflow steps in plain English', () => {
    expect(describeActivity({ action: 'eight_d.approved', changes: { comment: 'Good work' }, target_label: '8D-1' }).detail).toBe('Good work')
    expect(describeActivity({ action: 'eight_d.section_completed', changes: { section: 'D4' }, target_label: '' }).text).toBe('completed D4 Root cause')
    expect(describeActivity({ action: 'task.reassigned', changes: { assignee: { from: 'A', to: 'Bo' } }, target_label: '' }).text).toContain('Bo')
  })
})
