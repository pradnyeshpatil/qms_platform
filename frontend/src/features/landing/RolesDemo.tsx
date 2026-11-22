import { Check, Minus } from 'lucide-react'
import { useState } from 'react'
import { Reveal, SectionHead } from './ui'

const ACTIONS = ['View complaints', 'Create complaints', 'Assign owners', 'Close complaints', 'View customers', 'Edit customers', 'Invite employees', 'Manage roles'] as const

/** Mirrors the default roles seeded for every company (see backend/apps/rbac/catalog.py). */
const ROLES = [
  { name: 'Company Admin', blurb: 'Runs the workspace', scope: 'All records', can: [1, 1, 1, 1, 1, 1, 1, 1] },
  { name: 'Quality Manager', blurb: 'Owns the quality process', scope: 'All records', can: [1, 1, 1, 1, 1, 1, 0, 0] },
  { name: 'Quality Engineer', blurb: 'Investigates and fixes', scope: 'All records', can: [1, 1, 0, 0, 1, 1, 0, 0] },
  { name: 'Production Supervisor', blurb: 'Leads a department', scope: 'Own department only', can: [1, 0, 0, 0, 1, 0, 0, 0] },
  { name: 'Production Operator', blurb: 'Works on assigned items', scope: 'Assigned to them only', can: [1, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Viewer', blurb: 'Read-only access', scope: 'All records', can: [1, 0, 0, 0, 1, 0, 0, 0] },
] as const

export function RolesDemo() {
  const [i, setI] = useState(1)
  const role = ROLES[i]
  return (
    <section id="roles" className="bg-white py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHead eyebrow="Roles & permissions" title={<>The right access for <span className="lp-grad-text">everyone on the floor</span></>} sub="Pick a role to see what it can do. Admins can tweak any role or create their own." />
        <Reveal delay={120}>
          <div className="mt-14 grid gap-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-6 lg:grid-cols-[18rem_1fr]">
            <div role="tablist" aria-label="Roles" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              {ROLES.map((r, n) => (
                <button
                  key={r.name} role="tab" aria-selected={n === i} onClick={() => setI(n)}
                  className={`shrink-0 rounded-xl border px-4 py-3 text-left transition-all duration-300 ${n === i ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-600/25 lg:translate-x-2' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'}`}
                >
                  <span className="block text-sm font-semibold">{r.name}</span>
                  <span className={`block text-xs ${n === i ? 'text-blue-100' : 'text-slate-500'}`}>{r.blurb}</span>
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-bold text-slate-900">{role.name}</h3>
                <span key={role.scope} className="lp-pop rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">Sees: {role.scope}</span>
              </div>
              <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {ACTIONS.map((a, n) => {
                  const on = role.can[n] === 1
                  return (
                    <li key={a} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all duration-500 ${on ? 'border-emerald-200 bg-emerald-50 text-slate-900' : 'border-slate-200 bg-slate-50 text-slate-400'}`} style={{ transitionDelay: `${n * 40}ms` }}>
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-500 ${on ? 'scale-100 bg-emerald-500 text-white' : 'scale-90 bg-slate-200 text-slate-400'}`} style={{ transitionDelay: `${n * 40}ms` }}>
                        {on ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                      </span>
                      <span className={on ? 'font-medium' : 'line-through decoration-slate-300'}>{a}</span>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-5 text-xs text-slate-500">Permissions are enforced by the server on every request — hiding a button is never the only protection.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
