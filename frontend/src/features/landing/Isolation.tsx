import { Lock, ShieldCheck } from 'lucide-react'
import { Reveal, SectionHead } from './ui'

function Vault({ name, tone, rows }: { name: string; tone: 'blue' | 'violet'; rows: string[] }) {
  const ring = tone === 'blue' ? 'border-blue-500/40 bg-blue-500/10' : 'border-violet-500/40 bg-violet-500/10'
  const dot = tone === 'blue' ? 'bg-blue-400' : 'bg-violet-400'
  return (
    <div className={`w-full rounded-2xl border p-4 backdrop-blur ${ring}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-white"><Lock className="h-4 w-4 text-slate-300" />{name}</div>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r} className="flex items-center gap-2 rounded-lg bg-slate-900/60 px-3 py-2 text-xs text-slate-300"><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{r}</li>
        ))}
      </ul>
    </div>
  )
}

export function Isolation() {
  return (
    <section id="security" className="relative overflow-hidden bg-slate-950 py-24 text-slate-100 lg:py-32">
      <div className="lp-grid-dark absolute inset-0" aria-hidden />
      <div className="lp-blob left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 bg-emerald-500/20" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHead dark eyebrow="Security" title={<>Your data is <span className="lp-grad-text">invisible to every other company</span></>} sub="Every company gets its own walled-off workspace. Asking for another company's record — even with the exact ID — simply finds nothing." />

        <Reveal variant="scale" delay={120}>
          <div className="relative mx-auto mt-16 max-w-4xl">
            <div className="grid items-center gap-6 md:grid-cols-[1fr_5rem_1fr]">
              <Vault name="Company A" tone="blue" rows={['CMP-2026-00012 · Flange burrs', 'Customer: Acme Automotive', 'Role: Quality Engineer']} />
              <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
                <div className="lp-shield flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-500/15 text-emerald-300"><ShieldCheck className="h-8 w-8" /></div>
              </div>
              <Vault name="Company B" tone="violet" rows={['CMP-2026-00007 · Weld porosity', 'Customer: Initech Electronics', 'Role: Production Operator']} />
            </div>

            {/* packets that try to cross and are stopped at the shield */}
            <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden h-0 md:block" aria-hidden>
              <span className="lp-packet-l bg-blue-400 shadow-[0_0_12px_#60a5fa]" style={{ '--d': '0s' } as React.CSSProperties} />
              <span className="lp-packet-r bg-violet-400 shadow-[0_0_12px_#a78bfa]" style={{ '--d': '1.8s' } as React.CSSProperties} />
              <span className="lp-block absolute left-1/2 top-12 whitespace-nowrap rounded-md bg-red-500/90 px-2 py-1 text-[11px] font-bold text-white" style={{ '--d': '0s' } as React.CSSProperties}>404 · Not found</span>
              <span className="lp-block absolute left-1/2 top-12 whitespace-nowrap rounded-md bg-red-500/90 px-2 py-1 text-[11px] font-bold text-white" style={{ '--d': '1.8s' } as React.CSSProperties}>404 · Not found</span>
            </div>
          </div>
        </Reveal>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Separate workspaces', 'Each company lives at its own address and only members get in.'],
            ['Server-side permissions', 'Roles are checked on every request, not just in the screen.'],
            ['Hardened sign-in', 'Argon2 password hashing, CSRF protection and secure session cookies.'],
            ['Tested continuously', 'Automated tests try to read other companies’ data on every release.'],
          ].map(([t, d], i) => (
            <Reveal key={t} delay={i * 90}>
              <div className="h-full rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h3 className="font-semibold text-white">{t}</h3>
                <p className="mt-2 text-sm text-slate-400">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
