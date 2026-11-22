import { Mail, UserRound } from 'lucide-react'
import { useInView } from './hooks'
import { Reveal, SectionHead } from './ui'

function Flow({ icon: Icon, title, sub, steps, delay }: { icon: typeof Mail; title: string; sub: string; steps: string[]; delay: number }) {
  const [ref, seen] = useInView<HTMLOListElement>(0.3)
  return (
    <Reveal delay={delay} className="h-full">
      <div className="h-full rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white"><Icon className="h-6 w-6" /></span>
        <h3 className="mt-5 text-xl font-bold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{sub}</p>
        <ol ref={ref} className={`lp-flow mt-6 space-y-3 ${seen ? 'lp-in' : ''}`}>
          {steps.map((s, i) => (
            <li key={s} style={{ '--i': i } as React.CSSProperties} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-800">
              <span className="lp-tick flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">✓</span>{s}
            </li>
          ))}
        </ol>
      </div>
    </Reveal>
  )
}

export function Onboarding() {
  return (
    <section className="bg-slate-50 py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHead eyebrow="Your team" title={<>Get everyone in — <span className="lp-grad-text">even without email</span></>} sub="Office staff get an invitation. Shop-floor staff get a simple username. Both are set up in under a minute." />
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <Flow icon={Mail} title="Invite by email" sub="For engineers, managers and office staff." delay={0}
            steps={['Enter name, email, role and department', 'They get a secure, single-use link (valid 7 days)', 'They choose a password and are in']} />
          <Flow icon={UserRound} title="Username only" sub="For operators without a company email address." delay={120}
            steps={['Create a username and a temporary password', 'They sign in with workspace + username', 'They must set a new password at first login']} />
        </div>
      </div>
    </section>
  )
}
