import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, ErrorState, Loading } from '@/components/ui/misc'
import { api, tenantPath } from '@/lib/api'
import { SEVERITIES, type DashboardStats } from '@/lib/types'
import { PageHeader, useSlug } from '@/layout/AppLayout'

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-3xl font-bold ${tone ?? ''}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const slug = useSlug()
  const q = useQuery({ queryKey: [slug, 'dashboard'], queryFn: () => api<DashboardStats>(tenantPath(slug, 'dashboard/')) })
  return (
    <>
      <PageHeader title="Dashboard" />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Total complaints" value={q.data.total} />
            <Stat label="Open" value={q.data.open} tone="text-primary" />
            <Stat label="Overdue" value={q.data.overdue} tone={q.data.overdue ? 'text-destructive' : ''} />
          </div>
          <div>
            <h2 className="mb-3 font-semibold">By severity</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {SEVERITIES.map((s) => <Stat key={s} label={s[0].toUpperCase() + s.slice(1)} value={q.data.by_severity[s] ?? 0} />)}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
