import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
const Index = lazyRoute(() => import("./pages/Index.tsx"));
const Login = lazyRoute(() => import("./pages/Login.tsx"));
const SetPassword = lazyRoute(() => import("./pages/SetPassword.tsx"));
const UserManagementPage = lazyRoute(() => import("./pages/users/UserManagementPage.tsx"));
const AddStaff = lazyRoute(() => import("./pages/AddStaff.tsx"));
const StaffDetailPage = lazyRoute(() => import("./pages/staff/StaffDetailPage.tsx"));
const StaffFormPage = lazyRoute(() => import("./pages/staff/StaffFormPage.tsx"));
const AdminLeadsList = lazyRoute(() => import("./pages/AdminLeadsList.tsx"));
const CancelledLeadsBin = lazyRoute(() => import("./pages/CancelledLeadsBin.tsx"));
const CreateLead = lazyRoute(() => import("./pages/CreateLead.tsx"));
const LeadDetail = lazyRoute(() => import("./pages/LeadDetail.tsx"));
const ProjectFinalizationForm = lazyRoute(() => import("./pages/ProjectFinalizationForm.tsx"));
const ProjectDocuments = lazyRoute(() => import("./pages/ProjectDocuments.tsx"));
const OperatorProjectDetail = lazyRoute(() => import("./pages/OperatorProjectDetail.tsx"));
const MaterialDispatch = lazyRoute(() => import("./pages/MaterialDispatch.tsx"));
const WelderDashboard = lazyRoute(() => import("./pages/WelderDashboard.tsx"));
const ElectricianDashboard = lazyRoute(() => import("./pages/ElectricianDashboard.tsx"));
const ProjectsListPage = lazyRoute(() => import("./pages/projects/ProjectsListPage.tsx"));
const ProjectDetailPage = lazyRoute(() => import("./pages/projects/ProjectDetailPage.tsx"));
const PaymentsListPage = lazyRoute(() => import("./pages/payments/PaymentsListPage.tsx"));
const PaymentDetailPage = lazyRoute(() => import("./pages/payments/PaymentDetailPage.tsx"));
const SettingsPage = lazyRoute(() => import("./pages/SettingsPage.tsx"));
const ActivityLogs = lazyRoute(() => import("./pages/ActivityLogs.tsx"));
const InstallApp = lazyRoute(() => import("./pages/InstallApp.tsx"));
const Attendance = lazyRoute(() => import("./pages/Attendance.tsx"));
const AdminAttendance = lazyRoute(() => import("./pages/AdminAttendance.tsx"));
const SalaryManagement = lazyRoute(() => import("./pages/SalaryManagement.tsx"));
const MyAttendance = lazyRoute(() => import("./pages/MyAttendance.tsx"));
const AdminSettings = lazyRoute(() => import("./pages/AdminSettings.tsx"));
const StaffPerformance = lazyRoute(() => import("./pages/StaffPerformance.tsx"));
const Tasks = lazyRoute(() => import("./pages/Tasks.tsx"));
const ProjectHomeLocation = lazyRoute(() => import("./pages/ProjectHomeLocation.tsx"));
const NotFound = lazyRoute(() => import("./pages/NotFound.tsx"));
const PasswordResetLogs = lazyRoute(() => import("./pages/PasswordResetLogs.tsx"));
const StaffProfile = lazyRoute(() => import("./pages/StaffProfile.tsx"));
const KNumberLookup = lazyRoute(() => import("./pages/KNumberLookup.tsx"));
const StaffContacts = lazyRoute(() => import("./pages/StaffContacts.tsx"));
const VisitsListPage = lazyRoute(() => import("./pages/visits/VisitsListPage.tsx"));
const VisitDetailPage = lazyRoute(() => import("./pages/visits/VisitDetailPage.tsx"));
import ProtectedRoute from "./components/auth/ProtectedRoute.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { isRetryable } from "@/lib/retry";
import { lazyRoute } from "@/lib/lazyRoute";

/**
 * react-query's defaults are `staleTime: 0` and `refetchOnWindowFocus: true`,
 * which together mean every mounted query refetches every time the tab regains
 * focus. On a desktop that reads as the screen reloading whenever you come back
 * to it; on a phone it fires every time the app is resumed, on a connection
 * where a refetch is not free. Attendance had already opted out query by query,
 * which is the drift a shared default exists to prevent.
 *
 * A page that genuinely needs fresher data asks for it — by refetching after
 * its own mutation, through its realtime subscription, or with a shorter
 * staleTime of its own.
 *
 * `retry` is narrowed for the same reason the leads list retries: three
 * attempts is right for a connection that dropped, and pointless for a
 * permission error, which returns the same answer however many times it is
 * asked. `isRetryable` is the single definition of which is which.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
    },
  },
});

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Preserve the :id when redirecting the old /staff/:id[/edit] URLs to /users/:id.
const StaffRedirect = ({ edit = false }: { edit?: boolean }) => {
  const { id } = useParams();
  return <Navigate to={`/users/${id}${edit ? '/edit' : ''}`} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
          {/* Every page is a lazy chunk, so a route change can need a network
              round trip before it renders. The fallback is deliberately the same
              full-screen spinner ProtectedRoute shows while the profile
              resolves, so a cold navigation looks like one wait rather than two
              different ones. */}
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="/install" element={<InstallApp />} />
            <Route path="/" element={<Index />} />
            {/* Unified User Management module. Every signed-up user shows here;
                admin assigns a role (which activates them) and configures each
                role's module access under the Roles & Access tab. */}
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <UserManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/new"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AddStaff />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/reset-logs"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <PasswordResetLogs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/:id"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <StaffDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/:id/edit"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <StaffFormPage />
                </ProtectedRoute>
              }
            />
            {/* Backwards-compatible redirects from the old /staff/* URLs. */}
            <Route path="/staff" element={<Navigate to="/users" replace />} />
            <Route path="/staff/directory" element={<Navigate to="/users" replace />} />
            <Route path="/staff/new" element={<Navigate to="/users/new" replace />} />
            <Route path="/staff/reset-logs" element={<Navigate to="/users/reset-logs" replace />} />
            <Route path="/staff/:id/edit" element={<StaffRedirect edit />} />
            <Route path="/staff/:id" element={<StaffRedirect />} />
            <Route
              path="/leads"
              element={
                <ProtectedRoute module="crm">
                  <AdminLeadsList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/leads/bin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <CancelledLeadsBin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/leads/new"
              element={
                <ProtectedRoute module="crm">
                  <CreateLead />
                </ProtectedRoute>
              }
            />
            <Route
              path="/leads/:id"
              element={
                <ProtectedRoute module="crm">
                  <LeadDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects"
              element={
                <ProtectedRoute module="projects">
                  <ProjectsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/new"
              element={
                <ProtectedRoute allowedRoles={['admin', 'sales_person']}>
                  <ProjectFinalizationForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <ProtectedRoute module="projects">
                  <ProjectDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/edit"
              element={
                <ProtectedRoute allowedRoles={['admin', 'sales_person']}>
                  <ProjectFinalizationForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/documents"
              element={
                <ProtectedRoute module="projects">
                  <ProjectDocuments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/operator/projects/:projectId"
              element={
                <ProtectedRoute module="operations">
                  <OperatorProjectDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/material-dispatch"
              element={
                <ProtectedRoute module="operations">
                  <MaterialDispatch />
                </ProtectedRoute>
              }
            />
            {/* Inward payments across every project. Its own module since
                20260909100000: gating on `projects` handed a ledger to every
                role, and project_payments admits only admin, operator and
                sales-on-own — so three roles were advertised a page that could
                never show them a row. */}
            <Route
              path="/payments"
              element={
                <ProtectedRoute module="payments">
                  <PaymentsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments/:paymentId"
              element={
                <ProtectedRoute module="payments">
                  <PaymentDetailPage />
                </ProtectedRoute>
              }
            />

            {/* The legacy admin projects table was replaced by /projects.
                Left outside ProtectedRoute like the /staff redirects: the
                destination re-gates, and an admin-only gate here would 403 an
                operator following an old bookmark instead of forwarding them. */}
            <Route path="/admin/projects" element={<Navigate to="/projects" replace />} />
            <Route
              path="/activity-logs"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ActivityLogs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute allowedRoles={['admin', 'telecaller', 'sales_person', 'operator', 'welder', 'electrician']}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/attendance"
              element={
                <ProtectedRoute module="attendance">
                  <Attendance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/attendance"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminAttendance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/salary"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <SalaryManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-attendance"
              element={
                <ProtectedRoute module="attendance">
                  <MyAttendance />
                </ProtectedRoute>
              }
            />
            <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin']}><AdminSettings /></ProtectedRoute>} />
            <Route path="/admin/performance" element={<ProtectedRoute allowedRoles={['admin']}><StaffPerformance /></ProtectedRoute>} />
            <Route path="/tasks" element={<ProtectedRoute module="tasks"><Tasks /></ProtectedRoute>} />
            <Route path="/projects/:projectId/home-location" element={<ProtectedRoute module="projects"><ProjectHomeLocation /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute allowedRoles={['admin', 'telecaller', 'sales_person', 'operator', 'welder', 'electrician']}><StaffProfile /></ProtectedRoute>} />
            <Route path="/k-lookup" element={<ProtectedRoute allowedRoles={['admin', 'telecaller', 'sales_person', 'operator']}><KNumberLookup /></ProtectedRoute>} />
            <Route path="/contacts" element={<ProtectedRoute module="contacts"><StaffContacts /></ProtectedRoute>} />
            <Route
              path="/visits"
              element={
                <ProtectedRoute module="site_visits">
                  <VisitsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/visits/:visitId"
              element={
                <ProtectedRoute module="site_visits">
                  <VisitDetailPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
