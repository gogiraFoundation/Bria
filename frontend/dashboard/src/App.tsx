import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// ReactQueryDevtools - optional dev tool
let ReactQueryDevtools: React.ComponentType<any> | null = null;
try {
  if (process.env.NODE_ENV === 'development') {
    ReactQueryDevtools = require('@tanstack/react-query-devtools').ReactQueryDevtools;
  }
} catch (e) {
  // Devtools not available, that's okay
}

// Components
import DashboardLayout from './components/layout/DashboardLayout';
import SiteOverview from './pages/SiteOverview';
import SiteDetail from './pages/SiteDetail';
import ForecastsOverview from './pages/ForecastsOverview';
import AlertManagement from './pages/AlertManagement';
import SystemAdmin from './pages/SystemAdmin';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';

// Theme and utilities
import theme from './theme';
import { AuthProvider } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import NotificationProvider from './components/NotificationProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <WebSocketProvider>
            <NotificationProvider>
              <Router>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/change-password" element={<ChangePassword />} />
                  <Route path="/" element={<DashboardLayout />}>
                    <Route index element={<SiteOverview />} />
                    <Route path="sites/:siteId" element={<SiteDetail />} />
                    <Route path="forecast" element={<ForecastsOverview />} />
                    <Route path="forecast/:siteId" element={<SiteDetail />} />
                    <Route path="alerts" element={<AlertManagement />} />
                    <Route path="admin" element={<SystemAdmin />} />
                  </Route>
                </Routes>
              </Router>
            </NotificationProvider>
          </WebSocketProvider>
        </AuthProvider>
      </ThemeProvider>
      {ReactQueryDevtools && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

export default App;

