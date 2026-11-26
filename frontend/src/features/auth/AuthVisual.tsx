import { AnimatePresence, motion } from 'motion/react'
import { Check, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CountUp } from '@/components/kit/motion'
import { cn } from '@/lib/utils'

const STEPS = ['Open', 'Investigating', 'Resolved', 'Closed']
const FEED = [
  { who: 'Priya', text: 'logged a critical complaint', tone: 'bg-rose-400' },
  { who: 'Arun', text: 'was assigned as owner', tone: 'bg-sky-400' },
  { who: 'Meera', text: 'attached inspection photos', tone: 'bg-violet-400' },
  { who: 'Arun', text: 'moved it to Investigating', tone: 'bg-amber-400' },
  { who: 'Quality lead', text: 'approved the corrective action', tone: 'bg-emerald-400' },
  { who: 'Meera', text: 'closed the complaint', tone: 'bg-slate-300' },
]
const glass = 'rounded-2xl border border-white/20 bg-white/10 shadow-[0_20px_50px_-20px_rgb(15_23_42/0.6)] backdrop-blur-md'

function useTick(ms: number) {
  const [t, setT] = useState(0)
  useEffect(() => { const id = setInterval(() => setT((n) => n + 1), ms); return () => clearInterval(id) }, [ms])
  return t
}

function Workflow() {
  const step = useTick(1900) % (STEPS.length + 1) // last tick = brief reset pause
  const active = Math.min(step, STEPS.length - 1)
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className={cn(glass, 'p-6')}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Complaint #1042</p>
          <p className="mt-1 text-lg font-semibold text-white">Weld porosity on batch 7A</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-1 text-xs font-medium text-rose-100 ring-1 ring-inset ring-rose-300/30">
          <span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 animate-ping rounded-full bg-rose-400" /><span className="relative h-1.5 w-1.5 rounded-full bg-rose-400" /></span>Critical
        </span>
      </div>
      <ol className="relative mt-7 flex justify-between">
        <span className="absolute left-4 right-4 top-4 h-0.5 rounded-full bg-white/15" aria-hidden />
        <motion.span className="absolute left-4 top-4 h-0.5 origin-left rounded-full bg-gradient-to-r from-sky-300 to-emerald-300" style={{ width: 'calc(100% - 2rem)' }} animate={{ scaleX: step >= STEPS.length ? 0 : active / (STEPS.length - 1) }} transition={{ duration: 0.7, ease: 'easeInOut' }} aria-hidden />
        {STEPS.map((s, i) => {
          const done = step < STEPS.length && i < active, cur = step < STEPS.length && i === active
          return (
            <li key={s} className="relative z-10 flex w-20 flex-col items-center gap-2 text-center">
              <motion.span animate={{ scale: cur ? 1.15 : 1 }} className={cn('flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ring-4 ring-indigo-900/60 transition-colors duration-500', done ? 'bg-emerald-400 text-indigo-950' : cur ? 'bg-white text-indigo-700' : 'bg-indigo-800 text-indigo-200')}>
                {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
              </motion.span>
              <span className={cn('text-xs transition-colors duration-500', cur ? 'font-semibold text-white' : 'text-indigo-200')}>{s}</span>
            </li>
          )
        })}
      </ol>
    </motion.div>
  )
}

function Metric() {
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.6 }} className={cn(glass, 'p-5')}>
      <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Resolved on time</p>
      <p className="mt-1 flex items-baseline gap-1 text-4xl font-semibold text-white"><CountUp value={94} />%</p>
      <svg viewBox="0 0 200 56" className="mt-3 h-14 w-full" aria-hidden>
        <defs><linearGradient id="spark" x1="0" x2="1"><stop offset="0" stopColor="#7dd3fc" /><stop offset="1" stopColor="#6ee7b7" /></linearGradient></defs>
        <motion.path d="M2 46 L30 38 L58 42 L86 26 L114 30 L142 16 L170 20 L198 6" fill="none" stroke="url(#spark)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1] }} transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 1, times: [0, 0.7, 1], ease: 'easeInOut' }} />
      </svg>
    </motion.div>
  )
}

function Feed() {
  const t = useTick(2200)
  const items = [0, 1, 2].map((k) => t - 2 + k).filter((n) => n >= 0).map((n) => ({ n, ...FEED[n % FEED.length] }))
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6 }} className={cn(glass, 'p-5')}>
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-indigo-200">Live activity</p>
      <ul className="min-h-[7.5rem] space-y-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {items.map((e, i) => (
            <motion.li key={e.n} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1 - (items.length - 1 - i) * 0.3, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.4 }} className="flex items-center gap-3 text-sm text-indigo-50">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', e.tone)} aria-hidden />
              <span className="truncate"><strong className="font-semibold text-white">{e.who}</strong> {e.text}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </motion.div>
  )
}

/** Right-hand showcase for the auth pages: a complaint moving through its workflow. Decorative only. */
export function AuthVisual() {
  return (
    <aside className="relative hidden overflow-hidden bg-indigo-950 bg-cover bg-center p-12 text-white lg:flex lg:flex-col xl:p-16" style={{ backgroundImage: 'url(/auth-bg.svg)' }}>
      <motion.span aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 7, repeat: Infinity }} />
      <Link to="/" className="relative flex items-center gap-2.5 self-start focus-visible:outline-none">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30 backdrop-blur"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
        <span className="text-base font-semibold tracking-tight">QMS Platform</span>
      </Link>
      <div className="relative mt-14 max-w-xl">
        <h2 className="text-4xl font-semibold leading-tight tracking-tight xl:text-[44px]">Quality you can prove, complaints you can close.</h2>
        <p className="mt-4 flex items-center gap-2 text-[15px] text-indigo-100"><CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden />Every step tracked, every action on the record.</p>
      </div>
      <div className="relative mt-auto grid max-w-2xl gap-5 pt-10 xl:grid-cols-[1.4fr_1fr]" aria-hidden>
        <div className="xl:col-span-2"><Workflow /></div>
        <Feed />
        <Metric />
      </div>
    </aside>
  )
}
