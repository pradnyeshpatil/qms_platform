import { describe, expect, it } from 'vitest'
import { describeActivity } from './activity'

const e = (action: string, changes: Record<string, unknown> = {}, target_label = 'CMP-2026-00001') => ({ action, changes, target_label })

describe('describeActivity', () => {
  it('writes plain sentences for the main complaint events', () => {
    expect(describeActivity(e('complaint.created'))).toMatchObject({ kind: 'create', text: 'created this complaint' })
    expect(describeActivity(e('complaint.status_changed', { status: { from: 'New', to: 'Assigned' } })).text).toBe('moved the status from New to Assigned')
    expect(describeActivity(e('complaint.closed'))).toMatchObject({ kind: 'close', text: 'closed this complaint' })
    expect(describeActivity(e('complaint.reopened', { status: { from: 'Closed', to: 'Under Investigation' } })).text).toBe('reopened this complaint (now Under Investigation)')
  })

  it('lists changed fields with before → after', () => {
    const d = describeActivity(e('complaint.updated', { severity: { from: 'minor', to: 'major' }, due_date: { from: null, to: '2026-07-01' } }))
    expect(d.text).toBe('changed severity, due date')
    expect(d.detail).toBe('severity: minor → major · due date: none → 2026-07-01')
  })

  it('describes assignment changes', () => {
    expect(describeActivity(e('complaint.assigned', { owner: { from: null, to: 'Eli Engineer' } })).text).toBe('set the owner to Eli Engineer')
    expect(describeActivity(e('complaint.assigned', { assignees: { added: ['A B'], removed: ['C D'] } })).text).toBe('added A B and removed C D')
  })

  it('describes comments and files, including customer-visible ones', () => {
    expect(describeActivity(e('comment.created', { visibility: 'customer_visible', preview: 'Hello' }))).toMatchObject({ kind: 'comment', text: 'added a customer-visible comment', detail: 'Hello' })
    expect(describeActivity(e('attachment.uploaded', { name: 'photo.png' })).text).toBe('attached photo.png')
  })

  it('names the record when shown outside its own page', () => {
    expect(describeActivity(e('complaint.created'), 'CMP-2026-00001').text).toBe('created CMP-2026-00001')
    expect(describeActivity(e('complaint.status_changed', { status: { from: 'A', to: 'B' } }), 'CMP-1').text).toBe('moved CMP-1’s status from A to B')
  })

  it('falls back gracefully for unknown actions', () => {
    expect(describeActivity(e('something.new_happened')).text).toBe('something new happened')
  })
})
