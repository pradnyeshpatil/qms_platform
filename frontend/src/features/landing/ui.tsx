import { useInView } from './hooks'

type Variant = 'up' | 'left' | 'right' | 'scale'

/** Fades/slides children in the first time they scroll into view. */
export function Reveal({ children, delay = 0, variant = 'up', className = '' }: {
  children: React.ReactNode; delay?: number; variant?: Variant; className?: string
}) {
  const [ref, seen] = useInView<HTMLDivElement>(0.15)
  return (
    <div ref={ref} data-v={variant} style={{ '--d': `${delay}ms` } as React.CSSProperties} className={`lp-reveal ${seen ? 'lp-in' : ''} ${className}`}>
      {children}
    </div>
  )
}

/** Cursor-following glow for .lp-spot cards. */
export function spotlight(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

export function StatusChip({ live }: { live: boolean }) {
  return live ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Available now
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Coming soon</span>
  )
}

export function SectionHead({ eyebrow, title, sub, dark = false, center = true }: {
  eyebrow: string; title: React.ReactNode; sub?: string; dark?: boolean; center?: boolean
}) {
  return (
    <div className={`mx-auto max-w-3xl ${center ? 'text-center' : ''}`}>
      <Reveal><p className={`text-sm font-semibold uppercase tracking-widest ${dark ? 'text-cyan-300' : 'text-blue-600'}`}>{eyebrow}</p></Reveal>
      <Reveal delay={80}><h2 className={`mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl ${dark ? 'text-white' : 'text-slate-900'}`}>{title}</h2></Reveal>
      {sub && <Reveal delay={160}><p className={`mt-4 text-lg ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{sub}</p></Reveal>}
    </div>
  )
}
