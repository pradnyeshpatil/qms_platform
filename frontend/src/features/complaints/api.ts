import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, qs, tenantPath } from '@/lib/api'
import type { Complaint, DefectCategory, Employee, Page, WorkflowStatus } from '@/lib/types'
import { useMe } from '@/features/auth/auth'
import { useSlug } from '@/layout/AppLayout'

/** Workflow statuses (company-configurable). Everyone may read them. */
export function useStatuses() {
  const slug = useSlug()
  return useQuery({
    queryKey: [slug, 'statuses'],
    queryFn: () => api<WorkflowStatus[]>(tenantPath(slug, 'complaint-statuses/')),
    staleTime: 60_000,
  })
}

export function useDefectCategories() {
  const slug = useSlug()
  return useQuery({
    queryKey: [slug, 'defect-categories'],
    queryFn: () => api<DefectCategory[]>(tenantPath(slug, 'defect-categories/')),
    staleTime: 60_000,
  })
}

/** Active employees for owner / assignee pickers (needs users.view; callers handle the error). */
export function useEmployeeOptions(enabled = true) {
  const slug = useSlug()
  return useQuery({
    queryKey: [slug, 'employees', 'options'], enabled,
    queryFn: async () => (await api<Page<Employee>>(tenantPath(slug, 'employees/?status=active&page_size=100'))).results,
    staleTime: 60_000,
  })
}

export function useComplaint(id: string | undefined) {
  const slug = useSlug()
  return useQuery({ queryKey: [slug, 'complaint', id], queryFn: () => api<Complaint>(tenantPath(slug, `complaints/${id}/`)), enabled: !!id })
}

/** The signed-in user's membership in this workspace. */
export function useMembership() {
  const slug = useSlug()
  const { data: me } = useMe()
  return { me, membership: me?.memberships.find((m) => m.company.slug === slug) }
}

/** Refresh everything that shows a complaint after it changed. */
export function useRefreshComplaint() {
  const qc = useQueryClient()
  const slug = useSlug()
  return (complaint?: Complaint) => refreshComplaint(qc, slug, complaint)
}

export function refreshComplaint(qc: QueryClient, slug: string, complaint?: Complaint) {
  if (complaint) qc.setQueryData([slug, 'complaint', complaint.id], complaint)
  qc.invalidateQueries({ queryKey: [slug, 'complaints'] })
  qc.invalidateQueries({ queryKey: [slug, 'dashboard'] })
  if (complaint) qc.invalidateQueries({ queryKey: [slug, 'activity', complaint.id] })
}

export const targetQuery = (id: string, extra: Record<string, string | number> = {}, targetType = 'complaint') =>
  qs({ target_type: targetType, target_id: id, ...extra })
