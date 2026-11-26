import { describe, expect, it } from 'vitest'
import { daysAgo, dueInfo, fileSize, initials, timeAgo } from './format'

const NOW = new Date(2026, 5, 15, 12, 0, 0) // 15 Jun 2026, local

describe('dueInfo', () => {
  it('describes overdue, today, tomorrow and upcoming dates', () => {
    expect(dueInfo('2026-06-13', false, NOW)).toEqual({ label: '2 days overdue', tone: 'overdue' })
    expect(dueInfo('2026-06-14', false, NOW).label).toBe('1 day overdue')
    expect(dueInfo('2026-06-15', false, NOW)).toEqual({ label: 'Due today', tone: 'soon' })
    expect(dueInfo('2026-06-16', false, NOW)).toEqual({ label: 'Due tomorrow', tone: 'soon' })
    expect(dueInfo('2026-06-18', false, NOW)).toEqual({ label: 'Due in 3 days', tone: 'soon' })
    expect(dueInfo('2026-06-25', false, NOW)).toEqual({ label: 'Due in 10 days', tone: 'ok' })
  })
  it('is neutral when there is no date or the complaint is finished', () => {
    expect(dueInfo(null, false, NOW).tone).toBe('none')
    expect(dueInfo('2026-06-01', true, NOW).tone).toBe('none')
  })
})

describe('timeAgo', () => {
  const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
  it('uses friendly ranges', () => {
    expect(timeAgo(at(10_000), NOW.getTime())).toBe('just now')
    expect(timeAgo(at(5 * 60_000), NOW.getTime())).toBe('5 min ago')
    expect(timeAgo(at(3 * 3_600_000), NOW.getTime())).toBe('3 h ago')
    expect(timeAgo(at(30 * 3_600_000), NOW.getTime())).toBe('yesterday')
    expect(timeAgo(at(4 * 86_400_000), NOW.getTime())).toBe('4 days ago')
  })
})

describe('small helpers', () => {
  it('formats file sizes', () => {
    expect(fileSize(500)).toBe('500 B')
    expect(fileSize(2048)).toBe('2.0 KB')
    expect(fileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })
  it('makes initials', () => {
    expect(initials('Dana Admin')).toBe('DA')
    expect(initials('  cher ')).toBe('C')
    expect(initials(null)).toBe('?')
  })
  it('computes a date n days back', () => {
    expect(daysAgo(7, NOW)).toBe('2026-06-08')
    expect(daysAgo(30, NOW)).toBe('2026-05-16')
  })
})
