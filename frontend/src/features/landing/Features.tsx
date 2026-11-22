import { Bell, Building2, FileText, Gauge, Layers, ListChecks, Share2, ShieldCheck, Users, UserCog } from 'lucide-react'
import { Reveal, SectionHead, StatusChip, spotlight } from './ui'

const FEATURES = [
  { icon: Gauge, title: 'Complaint tracking & dashboard', live: true, span: 'lg:col-span-2', text: 'Severity, due dates, owners and customers in one searchable list, with a live dashboard that shows what is open and overdue.' },
  { icon: Users, title: 'Customer management', live: true, span: '', text: 'Keep every OEM and buyer in one place and see their complaint history.' },
  { icon: ShieldCheck, title: 'Roles & permissions', live: true, span: '', text: 'Six ready-made roles you can change, with department and assigned-only access.' },
  { icon: Building2, title: 'Plants & departments', live: true, span: '', text: 'Model how your factory is organised and tag complaints to the right place.' },
  { icon: UserCog, title: 'Easy team onboarding', live: true, span: 'lg:col-span-2', text: 'Invite colleagues by email, or create shop-floor logins with just a username — no email needed.' },
  { icon: FileText, title: '8D reports & PDF export', live: false, span: 'lg:col-span-2', text: 'Guided D0–D8 sections, approval, locked snapshots and a customer-ready PDF.' },
  { icon: ListChecks, title: 'Tasks & reminders', live: false, span: '', text: 'Corrective actions become tasks, with reminders before they slip.' },
  { icon: Layers, title: 'Custom fields', live: false, span: '', text: 'Capture the extra information your customers ask for.' },
  { icon: Share2, title: 'Customer share links', live: false, span: '', text: 'Send a secure, read-only view of a report to your customer.' },
  { icon: Bell, title: 'Notifications & audit trail', live: false, span: '', text: 'Know when something needs you, and see exactly who changed what.' },
] as const

export function Features() {
  return (
    <section id="features" className="bg-slate-50 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHead eyebrow="Features" title={<>Everything your quality team needs, <span className="lp-grad-text">in one place</span></>} sub="What you can use today, and what we are building next — clearly labelled." />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <Reveal key={f.title} delay={(i % 4) * 80} className={f.span}>
                <div onMouseMove={spotlight} className="lp-spot flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.live ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon className="h-5 w-5" /></span>
                    <StatusChip live={f.live} />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{f.text}</p>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
