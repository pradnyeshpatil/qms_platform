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
import { Menu, MenuItem, MenuSeparator } from '@/components/kit/menu'
import { PageTransition } from '@/components/kit/motion'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useCan, useMe } from '@/features/auth/auth'

/** Title row used by pages that have not been redesigned yet. */
export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">{title}</h1>
      {actions}
    </div>
  )
}

export function useSlug() {
  return useParams().slug as string
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-[0_8px_18px_-6px_rgb(79_70_229/0.7)]">
        <ShieldCheck className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-slate-900">QMS Platform</span>
    </div>
  )
}

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; show: boolean }

function NavList({ groups, slug, onNavigate }: { groups: { title: string; items: NavItem[] }[]; slug: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2 scroll-thin" aria-label="Main">
      {groups.filter((g) => g.items.length).map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={`/${slug}/${to}`} onClick={onNavigate}
                  className={({ isActive }) => cn('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60', isActive ? 'text-indigo-700' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900')}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-indigo-50 ring-1 ring-indigo-100" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
                      <Icon className={cn('relative h-[18px] w-[18px] transition-colors', isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600')} />
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
        { to: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, show: can('complaints.view') },
        { to: 'complaints', label: 'Complaints', icon: ClipboardList, show: can('complaints.view') },
        { to: 'customers', label: 'Customers', icon: Users, show: can('customers.view') },
      ],
    },
    {
      title: 'People & places',
      items: [
        { to: 'employees', label: 'Employees', icon: UserCog, show: can('users.view') },
        { to: 'roles', label: 'Roles', icon: ShieldCheck, show: can('roles.manage') },
        { to: 'organization', label: 'Plants & departments', icon: Building2, show: can('plants.manage') || can('departments.manage') },
      ],
    },
    {
      title: 'Admin',
      items: [
        { to: 'settings/complaints', label: 'Complaint settings', icon: SlidersHorizontal, show: can('settings.manage') },
        { to: 'audit', label: 'Audit log', icon: ScrollText, show: can('audit.view') },
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
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5"><Logo /></div>
      <div className="mx-3 mb-3 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/60 p-3 ring-1 ring-slate-200/70">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Workspace</p>
        <p className="truncate text-sm font-semibold text-slate-900">{membership.company.name}</p>
      </div>
      <NavList groups={groups} slug={slug} onNavigate={onNavigate} />
      <div className="border-t border-slate-200/70 p-3">
        <Menu
          align="start"
          trigger={
            <button type="button" className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60">
              <Avatar name={displayName} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{displayName}</span>
                <span className="block truncate text-xs text-slate-500">{membership.role.name}</span>
              </span>
              <ChevronsUpDown className="h-4 w-4 text-slate-400" aria-hidden />
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
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 border-r border-slate-200/70 bg-white/75 backdrop-blur-xl lg:block">{sidebar()}</aside>

      {/* mobile: top bar + slide-in menu */}
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur-xl lg:hidden">
          <Logo />
          <Dialog.Trigger asChild><Button variant="ghost" size="icon" aria-label="Open menu"><MenuIcon className="h-5 w-5" /></Button></Dialog.Trigger>
        </div>
        <AnimatePresence>
          {mobileOpen && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount><motion.div className="fixed inset-0 z-40 bg-slate-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /></Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.div className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-[var(--shadow-pop)]" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 34, stiffness: 340 }}>
                  <Dialog.Title className="sr-only">Menu</Dialog.Title>
                  <Dialog.Description className="sr-only">Site navigation</Dialog.Description>
                  <Dialog.Close asChild><Button variant="ghost" size="icon" className="absolute right-3 top-4" aria-label="Close menu"><X className="h-4 w-4" /></Button></Dialog.Close>
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
