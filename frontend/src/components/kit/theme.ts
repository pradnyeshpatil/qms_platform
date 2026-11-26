import type { Severity, StatusCategory } from '@/lib/types'

/** One colour language for the whole app: category -> status colours, severity -> urgency colours.
 *  Full class names (no string building) so Tailwind can see them. */
export const CATEGORY_STYLE: Record<StatusCategory, { dot: string; pill: string; bar: string; text: string }> = {
  open: { dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700 ring-sky-600/20', bar: '#0ea5e9', text: 'text-sky-600' },
  in_progress: { dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-700 ring-violet-600/20', bar: '#8b5cf6', text: 'text-violet-600' },
  waiting: { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700 ring-amber-600/20', bar: '#f59e0b', text: 'text-amber-600' },
  resolved: { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', bar: '#10b981', text: 'text-emerald-600' },
  closed: { dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600 ring-slate-500/20', bar: '#94a3b8', text: 'text-slate-500' },
}

export const SEVERITY_STYLE: Record<Severity, { dot: string; pill: string; bar: string; label: string }> = {
  minor: { dot: 'bg-slate-400', pill: 'bg-slate-50 text-slate-600 ring-slate-500/20', bar: '#94a3b8', label: 'Minor' },
  major: { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700 ring-amber-600/20', bar: '#f59e0b', label: 'Major' },
  critical: { dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700 ring-rose-600/20', bar: '#f43f5e', label: 'Critical' },
}

const AVATAR_TONES = [
  'bg-indigo-100 text-indigo-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-violet-100 text-violet-700', 'bg-teal-100 text-teal-700',
]
export function avatarTone(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_TONES[h % AVATAR_TONES.length]
}

/** Colour per app section, used by the sidebar, page titles and cards so each area has its own identity. */
export type Tone = 'indigo' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'orange' | 'teal'
export const TONE: Record<Tone, { tile: string; soft: string; text: string; fill: string; glow: string }> = {
  indigo: { tile: 'from-indigo-500 to-violet-600', soft: 'bg-indigo-50 text-indigo-600', text: 'text-indigo-600', fill: 'from-indigo-500 to-violet-600', glow: 'shadow-indigo-500/40' },
  sky: { tile: 'from-sky-400 to-blue-600', soft: 'bg-sky-50 text-sky-600', text: 'text-sky-600', fill: 'from-sky-500 to-blue-600', glow: 'shadow-sky-500/40' },
  emerald: { tile: 'from-emerald-400 to-teal-600', soft: 'bg-emerald-50 text-emerald-600', text: 'text-emerald-600', fill: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/40' },
  amber: { tile: 'from-amber-400 to-orange-500', soft: 'bg-amber-50 text-amber-600', text: 'text-amber-600', fill: 'from-amber-400 to-orange-500', glow: 'shadow-amber-500/40' },
  rose: { tile: 'from-rose-500 to-pink-600', soft: 'bg-rose-50 text-rose-600', text: 'text-rose-600', fill: 'from-rose-500 to-pink-600', glow: 'shadow-rose-500/40' },
  violet: { tile: 'from-violet-500 to-fuchsia-600', soft: 'bg-violet-50 text-violet-600', text: 'text-violet-600', fill: 'from-violet-500 to-fuchsia-600', glow: 'shadow-violet-500/40' },
  orange: { tile: 'from-orange-400 to-red-500', soft: 'bg-orange-50 text-orange-600', text: 'text-orange-600', fill: 'from-orange-400 to-red-500', glow: 'shadow-orange-500/40' },
  teal: { tile: 'from-teal-400 to-cyan-600', soft: 'bg-teal-50 text-teal-600', text: 'text-teal-600', fill: 'from-teal-500 to-cyan-600', glow: 'shadow-teal-500/40' },
}
export const SECTION_TONE = {
  dashboard: 'indigo', complaints: 'rose', customers: 'sky', employees: 'emerald',
  roles: 'violet', organization: 'amber', settings: 'teal', audit: 'orange',
} as const satisfies Record<string, Tone>
