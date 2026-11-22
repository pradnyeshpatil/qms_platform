import { lazy, Suspense } from 'react'
import { Navigate } from 'react-router-dom'
import { Loading } from '@/components/ui/misc'
import { useMe } from '@/features/auth/auth'

// The marketing site is code-split so signed-in users never download it.
const LandingPage = lazy(() => import('./LandingPage'))

/** `/`: signed-out visitors see the public website; signed-in users launch straight into the app. */
export function Home() {
  const { data: me, isLoading } = useMe()
  if (isLoading) return <Loading />
  if (me) {
    if (me.must_change_password) return <Navigate to="/change-password" replace />
    const slug = me.memberships[0]?.company.slug
    return slug ? <Navigate to={`/${slug}/dashboard`} replace /> : <p className="p-10">No company membership found.</p>
  }
  return <Suspense fallback={<Loading />}><LandingPage /></Suspense>
}
