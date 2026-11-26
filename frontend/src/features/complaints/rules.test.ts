import { describe, expect, it } from 'vitest'
import type { WorkflowStatus } from '@/lib/types'
import { blockedReason, checkFile } from './rules'

const st = (id: string, category: WorkflowStatus['category'], extra: Partial<WorkflowStatus> = {}): WorkflowStatus => ({
  id, name: id, category, system_key: id, is_default: false, is_active: true, sort_order: 0,
  is_finished: category === 'resolved' || category === 'closed', allowed_next: [], ...extra,
})

describe('blockedReason (status change rules shown in the UI)', () => {
  const open = st('new', 'open'), work = st('work', 'in_progress'), closed = st('closed', 'closed'), resolved = st('resolved', 'resolved')
  it('allows ordinary moves', () => expect(blockedReason(open, work, false)).toBeNull())
  it('blocks resolving/closing without permission, allows it with permission', () => {
    expect(blockedReason(open, closed, false)).toMatch(/resolve or close/)
    expect(blockedReason(open, resolved, false)).toMatch(/resolve or close/)
    expect(blockedReason(open, closed, true)).toBeNull()
  })
  it('blocks reopening without permission', () => {
    expect(blockedReason(closed, work, false)).toMatch(/reopen/)
    expect(blockedReason(closed, work, true)).toBeNull()
  })
  it('honours a configured workflow limit', () => {
    const limited = st('new', 'open', { allowed_next: ['work'] })
    expect(blockedReason(limited, work, true)).toBeNull()
    expect(blockedReason(limited, st('other', 'in_progress'), true)).toMatch(/Not allowed after/)
  })
  it('never blocks staying on the current status', () => expect(blockedReason(open, open, false)).toBeNull())
})

describe('checkFile (instant upload feedback)', () => {
  it('accepts allowed types within the size limit', () => {
    expect(checkFile({ name: 'photo.JPG', size: 1000 })).toBeNull()
    expect(checkFile({ name: 'report.pdf', size: 25 * 1024 * 1024 })).toBeNull()
  })
  it('rejects disallowed, empty, oversized and extensionless files', () => {
    expect(checkFile({ name: 'run.exe', size: 10 })).toMatch(/aren’t allowed/)
    expect(checkFile({ name: 'noext', size: 10 })).toMatch(/aren’t allowed/)
    expect(checkFile({ name: 'a.pdf', size: 0 })).toMatch(/empty/)
    expect(checkFile({ name: 'a.pdf', size: 25 * 1024 * 1024 + 1 })).toMatch(/Larger than 25 MB/)
  })
})
