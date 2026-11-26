import { ArrowUpRight } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { CountUp } from './motion'
import { TONE, type Tone } from './theme'

/** Gradient banner for the top of a page: title, subtitle, and a slot for controls. */
export function Hero({ title, subtitle, children, className }: { title: string; subtitle?: string; children?: React.ReactNode; className?: string }) {
  return (
    <section className={cn('relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-[0_24px_60px_-24px_rgb(99_70_229/0.7)] sm:p-8', className)}>
      <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 animate-[float_9s_ease-in-out_infinite] rounded-full bg-white/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 animate-[float_11s_ease-in-out_infinite_reverse] rounded-full bg-cyan-300/25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" aria-hidden />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-xl text-[15px] text-indigo-100">{subtitle}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
      </div>
    </section>
  )
}

/** Colourful KPI card that links somewhere. */
export function StatTile({ label, value, hint, icon: Icon, tone, to, pulse }: {
  label: string; value: number; hint: string; icon: React.ComponentType<{ className?: string }>; tone: Tone; to: string; pulse?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn('group relative block overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-lg transition duration-300 hover:-translate-y-1 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:ring-offset-2', TONE[tone].fill, TONE[tone].glow)}
    >
      <Icon className="pointer-events-none absolute -bottom-4 -right-3 h-28 w-28 rotate-[-12deg] text-white/15 transition duration-500 group-hover:scale-110 group-hover:rotate-[-6deg]" />
      <div className="relative flex items-start justify-between">
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30 backdrop-blur">
          {pulse && <span className="absolute inset-0 animate-[var(--animate-pulse-ring)] rounded-xl bg-white/40" aria-hidden />}
          <Icon className="relative h-5 w-5" />
        </span>
        <ArrowUpRight className="h-4 w-4 text-white/60 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" aria-hidden />
      </div>
      <p className="relative mt-4 text-[13px] font-medium text-white/85">{label}</p>
      <p className="relative mt-0.5 text-4xl font-semibold tabular-nums tracking-tight"><CountUp value={value} /></p>
      <p className="relative mt-1 text-xs text-white/75">{hint}</p>
    </Link>
  )
}
