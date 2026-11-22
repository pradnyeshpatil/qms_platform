import { useCountUp, useInView } from './hooks'
import { Reveal } from './ui'

function Fact({ value, suffix = '', label, delay }: { value: number; suffix?: string; label: string; delay: number }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.4)
  const v = useCountUp(value, seen)
  return (
    <Reveal delay={delay}>
      <div ref={ref} className="text-center">
        <p className="text-4xl font-extrabold tabular-nums text-slate-900 sm:text-5xl">{v}{suffix}</p>
        <p className="mt-1 text-sm font-medium text-slate-500">{label}</p>
      </div>
    </Reveal>
  )
}

/** Real product facts (no invented customer numbers). */
export function Facts() {
  return (
    <section className="border-y border-slate-200 bg-white py-12">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
        <Fact value={9} label="Steps in the 8D method (D0–D8)" delay={0} />
        <Fact value={6} label="Ready-made roles per company" delay={90} />
        <Fact value={37} label="Fine-grained permissions" delay={180} />
        <Fact value={14} suffix=" days" label="Free trial, no card" delay={270} />
      </div>
    </section>
  )
}
