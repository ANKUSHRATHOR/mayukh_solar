import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import SetPassword from "./pages/SetPassword.tsx";
import StaffManagement from "./pages/StaffManagement.tsx";
import AddStaff from "./pages/AddStaff.tsx";
import AdminLeadsList from "./pages/AdminLeadsList.tsx";
import CancelledLeadsBin from "./pages/CancelledLeadsBin.tsx";
import CreateLead from "./pages/CreateLead.tsx";
import LeadDetail from "./pages/LeadDetail.tsx";
import ProjectFinalizationForm from "./pages/ProjectFinalizationForm.tsx";
import ProjectDocuments from "./pages/ProjectDocuments.tsx";
import OperatorProjectDetail from "./pages/OperatorProjectDetail.tsx";
import WelderDashboard from "./pages/WelderDashboard.tsx";
import ElectricianDashboard from "./pages/ElectricianDashboard.tsx";
import AdminProjects from "./pages/AdminProjects.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import QuotationsList from "./pages/QuotationsList.tsx";
import ActivityLogs from "./pages/ActivityLogs.tsx";
import InstallApp from "./pages/InstallApp.tsx";
import Attendance from "./pages/Attendance.tsx";
import AdminAttendance from "./pages/AdminAttendance.tsx";
import SalaryManagement from "./pages/SalaryManagement.tsx";
import MyAttendance from "./pages/MyAttendance.tsx";
import NotFound from "./pages/NotFound.tsx";
import ProtectedRoute from "./components/auth/ProtectedRoute.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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
                <ProtectedRoute allowedRoles={['admin', 'telecaller']}>
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
              path="/projects/new"
              element={
                <ProtectedRoute allowedRoles={['admin', 'sales_person']}>
                  <ProjectFinalizationForm />
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
              path="/admin/projects"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminProjects />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations"
              element={
                <ProtectedRoute allowedRoles={['admin', 'sales_person', 'operator']}>
                  <QuotationsList />
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
