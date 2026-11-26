import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { Toaster } from 'sonner'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/features/auth/auth'
import { AuditLogPage } from '@/features/audit/AuditLogPage'
import { AcceptInvitePage, ChangePasswordPage, LoginPage, RegisterPage } from '@/features/auth/AuthPages'
import { ComplaintDetailPage } from '@/features/complaints/ComplaintDetailPage'
import { ComplaintsPage } from '@/features/complaints/ComplaintsPage'
import { ComplaintSettingsPage } from '@/features/settings/ComplaintSettingsPage'
import { CustomersPage } from '@/features/customers/CustomersPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { Home } from '@/features/landing/Home'
import { EmployeesPage } from '@/features/employees/EmployeesPage'
import { OrganizationPage } from '@/features/org/OrganizationPage'
import { RolesPage } from '@/features/roles/RolesPage'
import { AppLayout } from '@/layout/AppLayout'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route element={<RequireAuth />}>
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/:slug" element={<AppLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="complaints" element={<ComplaintsPage />} />
              <Route path="complaints/:id" element={<ComplaintDetailPage />} />
              <Route path="employees" element={<EmployeesPage />} />
              <Route path="roles" element={<RolesPage />} />
              <Route path="organization" element={<OrganizationPage />} />
              <Route path="settings/complaints" element={<ComplaintSettingsPage />} />
              <Route path="audit" element={<AuditLogPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" closeButton toastOptions={{ classNames: { toast: '!rounded-2xl !border-slate-200 !shadow-[var(--shadow-pop)] !font-sans' } }} />
      </MotionConfig>
    </QueryClientProvider>
  )
}
