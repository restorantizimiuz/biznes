import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BusinessesPage from './pages/BusinessesPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import FeatureFlagsPage from './pages/FeatureFlagsPage';
import UsersPage from './pages/UsersPage';
import AuditLogPage from './pages/AuditLogPage';
import SecurityPage from './pages/SecurityPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/kafelar" element={<BusinessesPage />} />
                <Route path="/obunalar" element={<SubscriptionsPage />} />
                <Route path="/feature-flags" element={<FeatureFlagsPage />} />
                <Route path="/foydalanuvchilar" element={<UsersPage mode="all" />} />
                <Route path="/xodimlar" element={<UsersPage mode="staff" />} />
                <Route path="/audit" element={<AuditLogPage />} />
                <Route path="/sozlamalar" element={<SecurityPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
