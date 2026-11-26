import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, tenantPath } from '@/lib/api'
import { useSlug } from '@/layout/AppLayout'
import type { CustomFieldDef, EightDDetail } from './types'

export function useReport(id: string | undefined) {
  const slug = useSlug()
  return useQuery({ queryKey: [slug, 'eight-d', id], enabled: !!id, queryFn: () => api<EightDDetail>(tenantPath(slug, `eight-d-reports/${id}/`)) })
}

/** After any change to a report: refresh it, the lists, its activity and the complaint's report list. */
export function useRefreshReport() {
  const qc = useQueryClient()
  const slug = useSlug()
  return (report?: EightDDetail) => {
    if (report) qc.setQueryData([slug, 'eight-d', report.id], report)
    qc.invalidateQueries({ queryKey: [slug, 'eight-d'] })
    qc.invalidateQueries({ queryKey: [slug, 'eight-d-list'] })
    qc.invalidateQueries({ queryKey: [slug, 'activity'] })
    qc.invalidateQueries({ queryKey: [slug, 'tasks'] })
  }
}

export const isConflict = (e: unknown) => !!e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'edit_conflict'

/** Company-defined extra fields for 8D reports (everyone may read; forms render from these). */
export function useCustomFields(includeInactive = false) {
  const slug = useSlug()
  return useQuery({
    queryKey: [slug, 'custom-fields', includeInactive],
    queryFn: () => api<CustomFieldDef[]>(tenantPath(slug, `custom-fields/?entity_type=eight_d_report${includeInactive ? '' : '&is_active=true'}`)),
    staleTime: 30_000,
  })
}
