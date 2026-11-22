import { useQuery } from '@tanstack/react-query'
import { api, tenantPath } from '@/lib/api'
import type { Department, Page, Plant, Role } from '@/lib/types'
import { useSlug } from '@/layout/AppLayout'

/** Reference lists for pickers. Cached per workspace. */
export function useRoles(enabled = true) {
  const slug = useSlug()
  return useQuery({
    queryKey: [slug, 'roles'], enabled,
    queryFn: async () => {
      const r = await api<Role[] | Page<Role>>(tenantPath(slug, 'roles/'))
      return Array.isArray(r) ? r : r.results
    },
  })
}
export function usePlants() {
  const slug = useSlug()
  return useQuery({ queryKey: [slug, 'plants'], queryFn: () => api<Plant[]>(tenantPath(slug, 'plants/')) })
}
export function useDepartments() {
  const slug = useSlug()
  return useQuery({ queryKey: [slug, 'departments'], queryFn: () => api<Department[]>(tenantPath(slug, 'departments/')) })
}
