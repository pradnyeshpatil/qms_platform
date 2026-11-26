const MINUTE = 60_000, HOUR = 3_600_000, DAY = 86_400_000

/** "just now", "5 min ago", "3 h ago", "yesterday", then a short date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime()
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`
  if (diff < 2 * DAY) return 'yesterday'
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} days ago`
  return shortDate(iso)
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = parseDay(iso)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** A YYYY-MM-DD date as a local date (new Date('2026-01-05') would be UTC and can shift a day). */
function parseDay(iso: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
}

export type DueInfo = { label: string; tone: 'overdue' | 'soon' | 'ok' | 'none' }

/** Friendly due-date text: "2 days overdue", "Due today", "Due in 3 days". Finished complaints are neutral. */
export function dueInfo(due: string | null, finished: boolean, now = new Date()): DueInfo {
  if (!due) return { label: 'No due date', tone: 'none' }
  if (finished) return { label: shortDate(due), tone: 'none' }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = Math.round((parseDay(due).getTime() - today) / DAY)
  if (days < 0) return { label: `${-days} day${days === -1 ? '' : 's'} overdue`, tone: 'overdue' }
  if (days === 0) return { label: 'Due today', tone: 'soon' }
  if (days === 1) return { label: 'Due tomorrow', tone: 'soon' }
  return { label: `Due in ${days} days`, tone: days <= 3 ? 'soon' : 'ok' }
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function daysAgo(n: number, now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - n)
  return ymd(d)
}
