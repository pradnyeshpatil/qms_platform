import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Building2, KeyRound, LayoutDashboard, LogOut, ShieldCheck, UserCog, Users } from 'lucide-react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useCan, useMe } from '@/features/auth/auth'

export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-2xl font-bold">{title}</h1>
      {actions}
    </div>
  )
}

export function useSlug() {
  return useParams().slug as string
}

export function AppLayout() {
  const slug = useSlug()
  const { data: me } = useMe()
  const qc = useQueryClient()
  const nav = useNavigate()
  const can = useCan()
  const membership = me?.memberships.find((m) => m.company.slug === slug)

  if (!membership) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-xl font-bold">Workspace not found</h1>
        <Button className="mt-4" onClick={() => nav('/')}>Go to my workspace</Button>
      </div>
    )
  }

  const links = [
    { to: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, show: can('complaints.view') },
    { to: 'complaints', label: 'Complaints', icon: AlertTriangle, show: can('complaints.view') },
    { to: 'customers', label: 'Customers', icon: Users, show: can('customers.view') },
    { to: 'employees', label: 'Employees', icon: UserCog, show: can('users.view') },
    { to: 'roles', label: 'Roles', icon: ShieldCheck, show: can('roles.manage') },
    { to: 'organization', label: 'Plants & departments', icon: Building2, show: can('plants.manage') || can('departments.manage') },
  ].filter((l) => l.show)
  const logout = async () => {
    await api('/api/v1/auth/logout/', { method: 'POST' })
    qc.clear()
    nav('/') // back to the public website
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border p-4">
          <p className="text-xs font-semibold uppercase text-primary">QMS Platform</p>
          <p className="truncate font-semibold">{membership.company.name}</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={`/${slug}/${to}`}
              className={({ isActive }) =>
                cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted', isActive && 'bg-muted text-primary')
              }
            >
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-sm">
          <p className="truncate px-2 text-muted-foreground">{me?.email ?? `${me?.first_name} ${me?.last_name}`}</p>
          <p className="truncate px-2 text-xs text-muted-foreground">{membership.role.name}</p>
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={() => nav('/change-password')}>
            <KeyRound className="h-4 w-4" /> Change password
          </Button>
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8"><Outlet /></main>
    </div>
  )
}
