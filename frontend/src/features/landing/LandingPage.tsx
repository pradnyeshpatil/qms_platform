import { ArrowRight, ChevronDown, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EightD } from './EightD'
import { Facts } from './Facts'
import { Features } from './Features'
import { Hero } from './Hero'
import { Isolation } from './Isolation'
import { Lifecycle } from './Lifecycle'
import { Onboarding } from './Onboarding'
import { RolesDemo } from './RolesDemo'
import { Reveal, SectionHead } from './ui'
import { useScroll } from './hooks'
import './landing.css'

const LINKS = [
  ['How it works', '#how-it-works'], ['8D method', '#eight-d'], ['Features', '#features'], ['Roles', '#roles'], ['Security', '#security'],
] as const

function Logo({ light = false }: { light?: boolean }) {
  return (
    <a href="#top" className="flex items-center gap-2 font-bold">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-sm font-black text-white">Q</span>
      <span className={light ? 'text-white' : 'text-slate-900'}>QMS Platform</span>
    </a>
  )
}

/** Sticky header + scroll progress. Isolated so only this re-renders while scrolling. */
function Nav() {
  const { y, progress } = useScroll()
  const [open, setOpen] = useState(false)
  const solid = y > 12 || open
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${solid ? 'border-b border-slate-200/70 bg-white/80 shadow-sm backdrop-blur-lg' : 'bg-transparent'}`}>
      <div className="absolute inset-x-0 top-0 h-0.5 origin-left bg-gradient-to-r from-blue-600 via-violet-500 to-cyan-400" style={{ transform: `scaleX(${progress})` }} aria-hidden />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 lg:flex" aria-label="Main">
          {LINKS.map(([label, href]) => <a key={href} href={href} className="transition hover:text-blue-600">{label}</a>)}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <Link to="/login" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">Sign in</Link>
          <Link to="/register" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700">Start free trial</Link>
        </div>
        <button type="button" className="rounded-lg p-2 text-slate-700 lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div className="lp-swap border-t border-slate-200 bg-white px-6 pb-5 lg:hidden">
          <nav className="flex flex-col py-2" aria-label="Mobile">
            {LINKS.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)} className="py-3 text-sm font-medium text-slate-700">{label}</a>)}
          </nav>
          <div className="flex gap-3">
            <Link to="/login" className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-semibold text-slate-800">Sign in</Link>
            <Link to="/register" className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white">Start free trial</Link>
          </div>
        </div>
      )}
    </header>
  )
}

const FAQ = [
  ['What can I use today?', 'Complaint tracking with a live dashboard, customer management, plants and departments, roles and permissions, and team onboarding by email or username. 8D reports, tasks, custom fields and customer share links are next and are labelled “Coming soon” on this page.'],
  ['Is my data separate from other companies?', 'Yes. Every company has its own workspace, and the server refuses any request for another company’s records. Automated tests check this on every release.'],
  ['My operators don’t have email. Can they still sign in?', 'Yes. Create them with a username and a temporary password. They sign in with your workspace name and username, and set their own password at first login.'],
  ['Do I need a credit card to try it?', 'No. The free trial lasts 14 days and does not ask for payment details.'],
  ['Who can see what inside my company?', 'You decide. Six roles come ready-made, and each permission can apply to all records, only your department’s, or only items assigned to you.'],
] as const

function Faq() {
  return (
    <section id="faq" className="bg-white py-24 lg:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHead eyebrow="FAQ" title="Questions, answered" />
        <div className="mt-12 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50">
          {FAQ.map(([q, a], i) => (
            <Reveal key={q} delay={i * 60}>
              <details className="group px-6 py-5">
                <summary className="flex items-center justify-between gap-4 text-left font-semibold text-slate-900">
                  {q}<ChevronDown className="lp-chev h-5 w-5 shrink-0 text-slate-500 transition-transform duration-300" />
                </summary>
                <div className="mt-3 text-sm leading-relaxed text-slate-600">{a}</div>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-violet-700 py-24 text-white">
      <div className="lp-grid-dark absolute inset-0 opacity-60" aria-hidden />
      <div className="lp-blob -left-10 top-0 h-72 w-72 bg-cyan-300/40" aria-hidden />
      <div className="lp-blob -right-10 bottom-0 h-72 w-72 bg-fuchsia-400/30" style={{ animationDelay: '-7s' }} aria-hidden />
      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <Reveal><h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Stop chasing complaints. Start closing them.</h2></Reveal>
        <Reveal delay={100}><p className="mt-5 text-lg text-blue-100">Set up your workspace in minutes and invite your team today.</p></Reveal>
        <Reveal delay={200}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link to="/register" className="lp-shine group inline-flex items-center gap-2 rounded-xl bg-white px-7 py-4 font-bold text-blue-700 shadow-xl transition hover:scale-[1.03]">
              Start your free trial <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link to="/login" className="rounded-xl border border-white/40 px-7 py-4 font-semibold text-white transition hover:bg-white/10">Sign in</Link>
          </div>
          <p className="mt-4 text-sm text-blue-200">14-day trial · No credit card required</p>
        </Reveal>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="bg-slate-950 py-12 text-slate-400">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
        <Logo light />
        <nav className="flex flex-wrap justify-center gap-6 text-sm" aria-label="Footer">
          {LINKS.map(([label, href]) => <a key={href} href={href} className="transition hover:text-white">{label}</a>)}
          <Link to="/login" className="transition hover:text-white">Sign in</Link>
          <Link to="/register" className="transition hover:text-white">Register</Link>
        </nav>
        <p className="text-xs">© {new Date().getFullYear()} QMS Platform</p>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  useEffect(() => {
    document.documentElement.classList.add('lp-smooth')
    const prev = document.title
    document.title = 'QMS Platform — Quality management & 8D reporting for manufacturers'
    return () => { document.documentElement.classList.remove('lp-smooth'); document.title = prev }
  }, [])
  return (
    <div id="top" className="lp overflow-x-clip bg-white text-slate-900">
      <Nav />
      <main>
        <Hero />
        <Facts />
        <Lifecycle />
        <EightD />
        <Features />
        <RolesDemo />
        <Isolation />
        <Onboarding />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
