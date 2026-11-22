import { ArrowRight, Bell, CheckCircle2, UserCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCountUp, useInView } from './hooks'
import { Reveal } from './ui'

const SEVERITY = {
  critical: 'bg-red-100 text-red-700',
  major: 'bg-amber-100 text-amber-700',
  minor: 'bg-slate-100 text-slate-600',
} as const

const ROWS = [
  { no: 'CMP-2026-00042', title: 'Burrs on machined flange', customer: 'Acme Automotive', sev: 'major' },
  { no: 'CMP-2026-00041', title: 'Anodizing colour out of spec', customer: 'Globex Industrial', sev: 'critical' },
  { no: 'CMP-2026-00040', title: 'Bore diameter over tolerance', customer: 'Initech Electronics', sev: 'major' },
  { no: 'CMP-2026-00039', title: 'Missing certificates of conformance', customer: 'Acme Automotive', sev: 'minor' },
] as const

const BARS = [38, 62, 45, 80, 55, 92, 70]

function Stat({ label, target, active, tone }: { label: string; target: number; active: boolean; tone: string }) {
  const v = useCountUp(target, active)
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{v}</p>
    </div>
  )
}

/** Illustrative product mock (sample data) that plays when it first appears. */
function ProductMock() {
  const [ref, seen] = useInView<HTMLDivElement>(0.2)
  return (
    <div ref={ref} className={`relative ${seen ? 'lp-play' : ''}`}>
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-blue-500/25 via-violet-500/20 to-cyan-400/25 blur-2xl" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl shadow-blue-900/10">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <div className="ml-3 flex-1 rounded-md bg-slate-100 px-3 py-1 text-xs text-slate-500">app.yourcompany.qms / dashboard</div>
        </div>
        <div className="grid grid-cols-[3.2rem_1fr] sm:grid-cols-[9rem_1fr]">
          <div className="space-y-2 border-r border-slate-200 bg-white p-3">
            {['Dashboard', 'Complaints', 'Customers', 'Employees'].map((n, i) => (
              <div key={n} className={`truncate rounded-md px-2 py-1.5 text-xs font-medium ${i === 0 ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}>
                <span className="hidden sm:inline">{n}</span><span className="sm:hidden">{n[0]}</span>
              </div>
            ))}
          </div>
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Open" target={18} active={seen} tone="text-slate-900" />
              <Stat label="Overdue" target={3} active={seen} tone="text-red-600" />
              <Stat label="Critical" target={2} active={seen} tone="text-amber-600" />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Complaints this week</p>
              <div className="mt-2 flex h-20 items-end gap-2">
                {BARS.map((h, i) => (
                  <div key={i} className="lp-bar flex-1 rounded-t bg-gradient-to-t from-blue-600 to-cyan-400" style={{ height: `${h}%`, '--d': `${0.5 + i * 0.08}s` } as React.CSSProperties} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {ROWS.map((r, i) => (
                <div key={r.no} className="lp-row flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2" style={{ '--d': `${0.9 + i * 0.18}s` } as React.CSSProperties}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800">{r.title}</p>
                    <p className="truncate text-[11px] text-slate-500">{r.no} · {r.customer}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SEVERITY[r.sev]}`}>{r.sev}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="lp-float absolute -right-3 -top-6 hidden sm:block" style={{ '--d': '0s' } as React.CSSProperties}>
        <div className="lp-toast flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl" style={{ '--d': '1.5s' } as React.CSSProperties}>
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600"><Bell className="h-4 w-4" /><span className="lp-ping absolute inset-0 rounded-full bg-red-400/40" /></span>
          <div><p className="text-xs font-semibold text-slate-800">New critical complaint</p><p className="text-[11px] text-slate-500">CMP-2026-00043 · Globex Industrial</p></div>
        </div>
      </div>
      <div className="lp-float absolute -bottom-6 -left-4 hidden sm:block" style={{ '--d': '1.2s' } as React.CSSProperties}>
        <div className="lp-toast flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl" style={{ '--d': '5.5s' } as React.CSSProperties}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600"><UserCheck className="h-4 w-4" /></span>
          <div><p className="text-xs font-semibold text-slate-800">Owner assigned</p><p className="text-[11px] text-slate-500">Quality Engineer · due in 3 days</p></div>
        </div>
      </div>
      <div className="lp-float absolute -bottom-3 right-10 hidden lg:block" style={{ '--d': '2.4s' } as React.CSSProperties}>
        <div className="lp-toast flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 shadow-lg" style={{ '--d': '3.5s' } as React.CSSProperties}>
          <CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="text-xs font-medium text-slate-700">Complaint closed</span>
        </div>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-24 pt-28 lg:pb-32 lg:pt-36">
      <div className="lp-grid absolute inset-0" aria-hidden />
      <div className="lp-blob -left-24 top-10 h-80 w-80 bg-blue-400/60" aria-hidden />
      <div className="lp-blob right-0 top-40 h-96 w-96 bg-violet-400/50" style={{ animationDelay: '-5s' }} aria-hidden />
      <div className="lp-blob bottom-0 left-1/3 h-72 w-72 bg-cyan-300/50" style={{ animationDelay: '-10s' }} aria-hidden />

      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-semibold text-blue-700 backdrop-blur">
              <span className="relative flex h-2 w-2"><span className="lp-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              Quality management for manufacturers
            </span>
          </Reveal>
          <Reveal delay={90}>
            <h1 className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
              Turn every customer complaint into a <span className="lp-grad-text">closed, documented fix.</span>
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p className="mt-6 max-w-xl text-lg text-slate-600">
              Log complaints, find root causes with structured 8D problem solving, assign the work and keep an audit trail your OEM customers trust — in one secure workspace for your whole team.
            </p>
          </Reveal>
          <Reveal delay={270}>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to="/register" className="lp-shine group inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/40">
                Start your free trial <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#how-it-works" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/70 px-6 py-3.5 font-semibold text-slate-800 backdrop-blur transition hover:border-slate-400 hover:bg-white">
                See how it works
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-500">14-day trial · No credit card required</p>
          </Reveal>
        </div>
        <Reveal variant="scale" delay={200}><ProductMock /></Reveal>
      </div>
    </section>
  )
}
