import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import SetPassword from "./pages/SetPassword.tsx";
import StaffManagement from "./pages/StaffManagement.tsx";
import AddStaff from "./pages/AddStaff.tsx";
import StaffListPage from "./pages/staff/StaffListPage.tsx";
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
            <Route
              path="/staff"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <StaffManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/new"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AddStaff />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/reset-logs"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <PasswordResetLogs />
                </ProtectedRoute>
              }
            />
            {/* Browsable staff directory with routed detail + form.
                /staff/manage keeps the existing console (password resets,
                pending approvals) until those actions move onto the detail page. */}
            <Route
              path="/staff/directory"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <StaffListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/:id"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <StaffDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/:id/edit"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <StaffFormPage />
                </ProtectedRoute>
              }
            />
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
                <ProtectedRoute allowedRoles={['admin', 'telecaller', 'sales_person']}>
                  <CreateLead />
                </ProtectedRoute>
              }
            />
            <Route
              path="/leads/:id"
              element={
                <ProtectedRoute allowedRoles={['admin', 'telecaller', 'sales_person']}>
                  <LeadDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects"
              element={
                <ProtectedRoute allowedRoles={['admin', 'operator', 'sales_person']}>
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
                <ProtectedRoute allowedRoles={['admin', 'operator', 'sales_person']}>
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
                <ProtectedRoute allowedRoles={['admin', 'sales_person', 'operator']}>
                  <ProjectDocuments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/operator/projects/:projectId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'operator']}>
                  <OperatorProjectDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/material-dispatch"
              element={
                <ProtectedRoute allowedRoles={['admin', 'operator', 'sales_person']}>
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
                <ProtectedRoute allowedRoles={['admin', 'sales_person', 'operator']}>
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
                <ProtectedRoute allowedRoles={['admin', 'telecaller', 'sales_person', 'operator', 'welder', 'electrician']}>
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
                <ProtectedRoute allowedRoles={['admin', 'telecaller', 'sales_person', 'operator', 'welder', 'electrician']}>
                  <MyAttendance />
                </ProtectedRoute>
              }
            />
            <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin']}><AdminSettings /></ProtectedRoute>} />
            <Route path="/admin/performance" element={<ProtectedRoute allowedRoles={['admin']}><StaffPerformance /></ProtectedRoute>} />
            <Route path="/field-visit" element={<ProtectedRoute allowedRoles={['admin', 'sales_person']}><FieldVisit /></ProtectedRoute>} />
            <Route path="/tasks" element={<ProtectedRoute allowedRoles={['admin', 'telecaller', 'sales_person', 'operator', 'welder', 'electrician']}><Tasks /></ProtectedRoute>} />
            <Route path="/projects/:projectId/home-location" element={<ProtectedRoute allowedRoles={['admin', 'sales_person', 'operator']}><ProjectHomeLocation /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute allowedRoles={['admin', 'telecaller', 'sales_person', 'operator', 'welder', 'electrician']}><StaffProfile /></ProtectedRoute>} />
            <Route path="/k-lookup" element={<ProtectedRoute allowedRoles={['admin', 'telecaller', 'sales_person', 'operator']}><KNumberLookup /></ProtectedRoute>} />
            <Route path="/contacts" element={<ProtectedRoute allowedRoles={['admin', 'telecaller', 'sales_person', 'operator', 'welder', 'electrician']}><StaffContacts /></ProtectedRoute>} />
            <Route
              path="/visits"
              element={
                <ProtectedRoute allowedRoles={['admin', 'sales_person', 'telecaller', 'operator']}>
                  <VisitsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/visits/:visitId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'sales_person', 'telecaller', 'operator']}>
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
