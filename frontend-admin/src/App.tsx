import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { NotificationsProvider } from './notifications/useOrderNotifications';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import OrdersPage from './pages/OrdersPage';
import MenuPage from './pages/MenuPage';
import TablesPage from './pages/TablesPage';
import StaffPage from './pages/StaffPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              {/* LanguageProvider aynan shu yerda — u kafe sozlamalarini so'raydi,
                  demak avval login bo'lgan bo'lishi kerak (LoginPage undan tashqarida).
                  NotificationsProvider ham shu yerda: u ovoz sozlamasini o'sha
                  ['settings'] so'rovidan oladi va WebSocket uchun token kerak. */}
              <Route
                element={
                  <LanguageProvider>
                    <NotificationsProvider>
                      <Layout />
                    </NotificationsProvider>
                  </LanguageProvider>
                }
              >
                <Route path="/" element={<OrdersPage />} />
                <Route path="/menu" element={<MenuPage />} />
                <Route path="/tables" element={<TablesPage />} />
                <Route path="/staff" element={<StaffPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
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
