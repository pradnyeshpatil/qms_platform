import { ClipboardList, FileCheck2, Inbox, Search, ShieldCheck, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useIsVisible, usePrefersReducedMotion } from './hooks'
import { Reveal, SectionHead, StatusChip } from './ui'

const STEPS = [
  {
    icon: Inbox, tag: 'Log', title: 'A complaint comes in', live: true,
    text: 'Capture it in seconds: customer, product, part number, severity and due date. Every complaint gets a company-unique number like CMP-2026-00042.',
    points: ['Customer and product linked automatically', 'Severity and due date tracked', 'Overdue items flagged on the dashboard'],
  },
  {
    icon: ShieldCheck, tag: 'D1–D3', title: 'Contain it and assign an owner', live: true,
    text: 'Name an owner, tag the plant and department, and protect the customer while you investigate.',
    points: ['Owner assignment with its own permission', 'Plant and department tagging', 'Scoped views: people see what they should'],
  },
  {
    icon: Search, tag: 'D4', title: 'Find the real root cause', live: false,
    text: 'Structured investigation instead of scattered emails: describe the problem, test causes, and keep the evidence next to the complaint.',
    points: ['Guided 8D problem statement', 'Root-cause and escape-point analysis', 'Evidence attached to each section'],
  },
  {
    icon: Wrench, tag: 'D5–D6', title: 'Fix it and prove it worked', live: false,
    text: 'Turn corrective actions into tasks with owners and due dates, then record the validation results.',
    points: ['Actions become assignable tasks', 'Reminders before things go overdue', 'Validation recorded with the report'],
  },
  {
    icon: FileCheck2, tag: 'D7–D8', title: 'Approve, prevent recurrence, report', live: false,
    text: 'A manager approves the report, the snapshot is locked, and a clean PDF goes to your customer.',
    points: ['Approval workflow with locking', 'Prevent-recurrence actions captured', 'One-click PDF export'],
  },
  {
    icon: ClipboardList, tag: 'Close', title: 'Close the loop with the customer', live: false,
    text: 'Share a read-only link, close the complaint and keep a complete history for your next audit.',
    points: ['Secure customer share links', 'Full activity history', 'Closed-complaint archive'],
  },
] as const

export function Lifecycle() {
  const [ref, visible] = useIsVisible<HTMLDivElement>(0.35)
  const reduced = usePrefersReducedMotion()
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!visible || paused || reduced) return
    const id = window.setInterval(() => setActive((a) => (a + 1) % STEPS.length), 4200)
    return () => window.clearInterval(id)
  }, [visible, paused, reduced])

  const step = STEPS[active]
  const Icon = step.icon
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-slate-950 py-24 text-slate-100 lg:py-32">
      <div className="lp-grid-dark absolute inset-0" aria-hidden />
      <div className="lp-blob -right-20 top-0 h-80 w-80 bg-blue-600/40" aria-hidden />
      <div className="lp-blob -left-20 bottom-0 h-80 w-80 bg-violet-600/30" style={{ animationDelay: '-8s' }} aria-hidden />
      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHead dark eyebrow="How it works" title={<>From complaint to closure, <span className="lp-grad-text">one clear path</span></>} sub="Follow a real complaint through the way your quality team already works — with nothing falling through the cracks." />

        <div ref={ref} className="mt-16" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <Reveal>
            <div className="relative">
              <div className="absolute left-0 right-0 top-6 hidden h-0.5 bg-slate-800 md:block" aria-hidden />
              <div className="lp-track-fill absolute left-0 top-6 hidden h-0.5 bg-gradient-to-r from-blue-500 to-cyan-400 md:block" style={{ width: `${(active / (STEPS.length - 1)) * 100}%` }} aria-hidden />
              <ol className="relative grid grid-cols-3 gap-y-6 md:grid-cols-6">
                {STEPS.map((s, i) => {
                  const done = i < active
                  const on = i === active
                  return (
                    <li key={s.title} className="flex flex-col items-center">
                      <button
                        type="button" onClick={() => { setActive(i); setPaused(true) }} aria-current={on ? 'step' : undefined} aria-label={`${s.tag}: ${s.title}`}
                        className={`relative flex h-12 w-12 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-500 ${on ? 'scale-110 border-cyan-300 bg-blue-600 text-white shadow-lg shadow-blue-500/40' : done ? 'border-blue-500 bg-blue-500/20 text-blue-200' : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500'}`}
                      >
                        {on && <span className="lp-ping absolute inset-0 rounded-full bg-cyan-400/30" aria-hidden />}
                        {i + 1}
                      </button>
                      <span className={`mt-3 text-xs font-semibold uppercase tracking-wide transition-colors ${on ? 'text-cyan-300' : 'text-slate-500'}`}>{s.tag}</span>
                    </li>
                  )
                })}
              </ol>
            </div>
          </Reveal>

          <div key={active} className="lp-swap mx-auto mt-12 grid max-w-4xl items-center gap-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur sm:p-10 md:grid-cols-[auto_1fr]" aria-live="polite">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 shadow-lg shadow-blue-600/30">
              <Icon className="h-9 w-9 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-2xl font-bold text-white">{step.title}</h3>
                <StatusChip live={step.live} />
              </div>
              <p className="mt-3 text-slate-300">{step.text}</p>
              <ul className="mt-5 grid gap-2 sm:grid-cols-1">
                {step.points.map((p, i) => (
                  <li key={p} className="lp-swap flex items-center gap-2 text-sm text-slate-200" style={{ animationDelay: `${0.12 * (i + 1)}s` }}>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">✓</span>{p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-slate-500">{paused ? 'Paused — click any step to explore' : 'Auto-playing — hover to pause, click a step to jump'}</p>
        </div>
      </div>
    </section>
  )
}
