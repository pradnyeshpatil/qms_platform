import * as Dialog from '@radix-ui/react-dialog'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import {
  Building2, ChevronsUpDown, ClipboardList, KeyRound, LayoutDashboard, LogOut, Menu as MenuIcon, ScrollText,
  ShieldCheck, SlidersHorizontal, UserCog, Users, X,
} from 'lucide-react'
import * as React from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '@/components/kit/avatar'
import { Button } from '@/components/kit/button'
import { PageTitle } from '@/components/kit/card'
import { Menu, MenuItem, MenuSeparator } from '@/components/kit/menu'
import { SECTION_TONE, TONE, type Tone } from '@/components/kit/theme'
import { PageTransition } from '@/components/kit/motion'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useCan, useMe } from '@/features/auth/auth'

/** Page title row with an optional coloured icon tile (colour = app section). */
export function PageHeader({ title, subtitle, actions, icon, tone }: { title: string; subtitle?: string; actions?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: Tone }) {
  return <PageTitle title={title} subtitle={subtitle} actions={actions} icon={icon} tone={tone} />
}

export function useSlug() {
  return useParams().slug as string
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-indigo-500 text-white shadow-[0_8px_20px_-6px_rgb(217_70_239/0.7)] ring-1 ring-white/25">
        <ShieldCheck className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-white">QMS Platform</span>
    </div>
  )
}

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; tone: Tone; show: boolean }

function NavList({ groups, slug, onNavigate }: { groups: { title: string; items: NavItem[] }[]; slug: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2 scroll-thin" aria-label="Main">
      {groups.filter((g) => g.items.length).map((g) => (
        <div key={g.title}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-indigo-200/55">{g.title}</p>
          <ul className="space-y-1">
            {g.items.map(({ to, label, icon: Icon, tone }) => (
              <li key={to}>
                <NavLink
                  to={`/${slug}/${to}`} onClick={onNavigate}
                  className={({ isActive }) => cn('group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60', isActive ? 'text-white' : 'text-indigo-100/75 hover:bg-white/[0.07] hover:text-white')}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-white/[0.13] ring-1 ring-white/20" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
                      <span className={cn('relative flex h-8 w-8 items-center justify-center rounded-lg transition duration-200', isActive ? cn('bg-gradient-to-br text-white shadow-lg', TONE[tone].tile, TONE[tone].glow) : 'bg-white/10 text-indigo-100 group-hover:bg-white/15')}>
                        <Icon className="h-[17px] w-[17px]" />
                      </span>
                      <span className="relative">{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function AppLayout() {
  const slug = useSlug()
  const { data: me } = useMe()
  const qc = useQueryClient()
  const nav = useNavigate()
  const can = useCan()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const membership = me?.memberships.find((m) => m.company.slug === slug)

  if (!membership) {
    return (
      <div className="bg-app flex min-h-screen flex-col items-center justify-center gap-4 p-10 text-center">
        <h1 className="text-xl font-semibold">Workspace not found</h1>
        <Button onClick={() => nav('/')}>Go to my workspace</Button>
      </div>
    )
  }

  const groups = [
    {
      title: 'Quality',
      items: [
        { to: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, tone: SECTION_TONE.dashboard, show: can('complaints.view') },
        { to: 'complaints', label: 'Complaints', icon: ClipboardList, tone: SECTION_TONE.complaints, show: can('complaints.view') },
        { to: 'customers', label: 'Customers', icon: Users, tone: SECTION_TONE.customers, show: can('customers.view') },
      ],
    },
    {
      title: 'People & places',
      items: [
        { to: 'employees', label: 'Employees', icon: UserCog, tone: SECTION_TONE.employees, show: can('users.view') },
        { to: 'roles', label: 'Roles', icon: ShieldCheck, tone: SECTION_TONE.roles, show: can('roles.manage') },
        { to: 'organization', label: 'Plants & departments', icon: Building2, tone: SECTION_TONE.organization, show: can('plants.manage') || can('departments.manage') },
      ],
    },
    {
      title: 'Admin',
      items: [
        { to: 'settings/complaints', label: 'Complaint settings', icon: SlidersHorizontal, tone: SECTION_TONE.settings, show: can('settings.manage') },
        { to: 'audit', label: 'Audit log', icon: ScrollText, tone: SECTION_TONE.audit, show: can('audit.view') },
      ],
    },
  ].map((g) => ({ ...g, items: g.items.filter((i) => i.show) }))

  const displayName = `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim() || me?.email || 'Account'
  const logout = async () => {
    await api('/api/v1/auth/logout/', { method: 'POST' })
    qc.clear()
    nav('/') // back to the public website
  }

  const sidebar = (onNavigate?: () => void) => (
    <div className="relative flex h-full flex-col overflow-hidden bg-gradient-to-b from-[#1b1750] via-[#241b66] to-[#33135f] text-white">
      <div className="pointer-events-none absolute -left-16 top-24 h-56 w-56 rounded-full bg-indigo-500/25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-20 bottom-24 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" aria-hidden />
      <div className="relative px-5 pb-4 pt-5"><Logo /></div>
      <div className="relative mx-3 mb-4 rounded-2xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur">
        <p className="text-[11px] font-medium uppercase tracking-wider text-indigo-200/70">Workspace</p>
        <p className="truncate text-sm font-semibold text-white">{membership.company.name}</p>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col"><NavList groups={groups} slug={slug} onNavigate={onNavigate} /></div>
      <div className="relative border-t border-white/10 p-3">
        <Menu
          align="start"
          trigger={
            <button type="button" className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
              <Avatar name={displayName} className="ring-white/30" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{displayName}</span>
                <span className="block truncate text-xs text-indigo-200/70">{membership.role.name}</span>
              </span>
              <ChevronsUpDown className="h-4 w-4 text-indigo-200/70" aria-hidden />
            </button>
          }
        >
          <MenuItem icon={<KeyRound className="h-4 w-4" />} onSelect={() => nav('/change-password')}>Change password</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<LogOut className="h-4 w-4" />} onSelect={logout} danger>Sign out</MenuItem>
        </Menu>
      </div>
    </div>
  )

  return (
    <div className="bg-app flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[268px] shrink-0 lg:block">{sidebar()}</aside>

      {/* mobile: top bar + slide-in menu */}
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between bg-gradient-to-r from-[#1b1750] to-[#33135f] px-4 shadow-lg lg:hidden">
          <Logo />
          <Dialog.Trigger asChild><Button variant="ghost" size="icon" aria-label="Open menu" className="text-white hover:bg-white/10 hover:text-white"><MenuIcon className="h-5 w-5" /></Button></Dialog.Trigger>
        </div>
        <AnimatePresence>
          {mobileOpen && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount><motion.div className="fixed inset-0 z-40 bg-slate-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /></Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.div className="fixed inset-y-0 left-0 z-50 w-72 shadow-[var(--shadow-pop)]" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 34, stiffness: 340 }}>
                  <Dialog.Title className="sr-only">Menu</Dialog.Title>
                  <Dialog.Description className="sr-only">Site navigation</Dialog.Description>
                  <Dialog.Close asChild><Button variant="ghost" size="icon" className="absolute right-3 top-4 z-10 text-white hover:bg-white/10 hover:text-white" aria-label="Close menu"><X className="h-4 w-4" /></Button></Dialog.Close>
                  {sidebar(() => setMobileOpen(false))}
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>

      <main className="min-w-0 flex-1 px-4 pb-16 pt-20 sm:px-6 lg:px-10 lg:pt-10">
        <div className="mx-auto max-w-[1280px]">
          <PageTransition key={pathname}><Outlet /></PageTransition>
        </div>
      </main>
    </div>
  )
}
