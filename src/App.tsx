import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import SetPassword from "./pages/SetPassword.tsx";
import UserManagementPage from "./pages/users/UserManagementPage.tsx";
import AddStaff from "./pages/AddStaff.tsx";
import StaffDetailPage from "./pages/staff/StaffDetailPage.tsx";
import StaffFormPage from "./pages/staff/StaffFormPage.tsx";
import AdminLeadsList from "./pages/AdminLeadsList.tsx";
import CancelledLeadsBin from "./pages/CancelledLeadsBin.tsx";
import CreateLead from "./pages/CreateLead.tsx";
import LeadDetail from "./pages/LeadDetail.tsx";
import ProjectFinalizationForm from "./pages/ProjectFinalizationForm.tsx";
import ProjectDocuments from "./pages/ProjectDocuments.tsx";
import OperatorProjectDetail from "./pages/OperatorProjectDetail.tsx";
import MaterialDispatch from "./pages/MaterialDispatch.tsx";
import WelderDashboard from "./pages/WelderDashboard.tsx";
import ElectricianDashboard from "./pages/ElectricianDashboard.tsx";
import AdminProjects from "./pages/AdminProjects.tsx";
import ProjectsListPage from "./pages/projects/ProjectsListPage.tsx";
import ProjectDetailPage from "./pages/projects/ProjectDetailPage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import ActivityLogs from "./pages/ActivityLogs.tsx";
import InstallApp from "./pages/InstallApp.tsx";
import Attendance from "./pages/Attendance.tsx";
import AdminAttendance from "./pages/AdminAttendance.tsx";
import SalaryManagement from "./pages/SalaryManagement.tsx";
import MyAttendance from "./pages/MyAttendance.tsx";
import AdminSettings from "./pages/AdminSettings.tsx";
import StaffPerformance from "./pages/StaffPerformance.tsx";
import FieldVisit from "./pages/FieldVisit.tsx";
import Tasks from "./pages/Tasks.tsx";
import ProjectHomeLocation from "./pages/ProjectHomeLocation.tsx";
import NotFound from "./pages/NotFound.tsx";
import PasswordResetLogs from "./pages/PasswordResetLogs.tsx";
import StaffProfile from "./pages/StaffProfile.tsx";
import KNumberLookup from "./pages/KNumberLookup.tsx";
import StaffContacts from "./pages/StaffContacts.tsx";
import DealsDashboard from "./pages/DealsDashboard.tsx";
import VisitsListPage from "./pages/visits/VisitsListPage.tsx";
import VisitDetailPage from "./pages/visits/VisitDetailPage.tsx";
import ProtectedRoute from "./components/auth/ProtectedRoute.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";

const queryClient = new QueryClient();

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
                <ProtectedRoute allowedRoles={['admin']}>
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
                <ProtectedRoute module="projects">
                  <OperatorProjectDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/material-dispatch"
              element={
                <ProtectedRoute module="projects">
                  <MaterialDispatch />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/projects"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminProjects />
                </ProtectedRoute>
              }
            />
            <Route
              path="/deals"
              element={
                <ProtectedRoute module="crm">
                  <DealsDashboard />
                </ProtectedRoute>
              }
            />
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
            <Route path="/field-visit" element={<ProtectedRoute module="crm"><FieldVisit /></ProtectedRoute>} />
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
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
