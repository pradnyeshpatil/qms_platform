import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import type { Me } from '@/lib/types'
import { Card, CardContent, Loading } from '@/components/ui/misc'

export const ME_KEY = ['me']

/** Returns the current user, or null when logged out (403). */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api<Me>('/api/v1/auth/me/')
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null
        throw e
      }
    },
    staleTime: 60_000,
    retry: false,
  })
}

/** Permission check for the current workspace. UI convenience only: the API enforces every rule. */
export function useCan() {
  const slug = useParams().slug
  const { data: me } = useMe()
  const permissions = me?.memberships.find((m) => m.company.slug === slug)?.permissions ?? {}
  return (code: string) => code in permissions
}

export function RequireAuth() {
  const { data, isLoading } = useMe()
  const { pathname } = useLocation()
  if (isLoading) return <Loading />
  if (!data) return <Navigate to="/login" replace />
  // Admin-issued temporary passwords must be replaced before anything else is usable.
  if (data.must_change_password && pathname !== '/change-password') return <Navigate to="/change-password" replace />
  return <Outlet />
}

/** Page-level gate. Hides the page body when the permission is missing (the API would 403 anyway). */
export function RequirePermission({ permission, children }: { permission: string; children: React.ReactNode }) {
  const can = useCan()
  if (can(permission)) return <>{children}</>
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <h1 className="text-lg font-semibold">You don't have access to this page</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ask a company admin if you need the “{permission}” permission.</p>
      </CardContent>
    </Card>
  )
}

export function HomeRedirect() {
  const { data } = useMe()
  const slug = data?.memberships[0]?.company.slug
  return slug ? <Navigate to={`/${slug}/dashboard`} replace /> : <p className="p-10">No company membership found.</p>
}
