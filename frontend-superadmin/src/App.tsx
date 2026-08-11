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
import ComingSoonPage from './pages/ComingSoonPage';

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
                {/* Platforma darajasida hali backend endpointi yo'q bo'limlar —
                    tekshirib.ber tahlilida aniqlangan: users/staff/audit/settings
                    uchun /api/v1/platform/* guruhida route mavjud emas. */}
                <Route
                  path="/foydalanuvchilar"
                  element={<ComingSoonPage icon="👥" title="Foydalanuvchilar" />}
                />
                <Route
                  path="/xodimlar"
                  element={<ComingSoonPage icon="👨‍💼" title="Xodimlar" />}
                />
                <Route path="/audit" element={<ComingSoonPage icon="📋" title="Audit jurnali" />} />
                <Route
                  path="/sozlamalar"
                  element={<ComingSoonPage icon="⚙️" title="Platforma sozlamalari" />}
                />
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
