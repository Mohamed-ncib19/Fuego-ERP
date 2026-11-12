import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/hooks/use-auth-store";
import { useToastStore, ToastViewport } from "@/hooks/use-toast";
import { setApiKey } from "@/lib/api/client";
import { PageLoader } from "@/components/ui";
import LoginPage from "@/pages/login";
import SetupPage from "@/pages/setup";
import DashboardPage from "@/pages/dashboard";
import UsersSettingsPage from "@/pages/settings-users";
import SettingsPage from "@/pages/settings";
import ProfilePage from "@/pages/profile";
import {
  OrdersPlaceholderPage,
  FinancesPlaceholderPage,
} from "@/pages/placeholders";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

/** Root: decide between setup wizard, login and dashboard. */
function RootGate() {
  const { status, hydrate } = useAuthStore();
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === "loading") return <PageLoader />;
  if (status === "authenticated") return <Navigate to="/dashboard" replace />;
  return <Navigate to="/login" replace />;
}

/** Wraps dashboard pages behind the session. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, hydrate } = useAuthStore();
  const location = useLocation();
  useEffect(() => {
    if (status === "loading") void hydrate();
  }, [status, hydrate]);
  if (status === "loading") return <PageLoader />;
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Admin-only wrapper (users + settings). */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (user?.role !== "super_admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootGate />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/orders"
        element={
          <RequireAuth>
            <OrdersPlaceholderPage />
          </RequireAuth>
        }
      />
      <Route
        path="/finances"
        element={
          <RequireAuth>
            <FinancesPlaceholderPage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <RequireAdmin>
              <SettingsPage />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/settings/users"
        element={
          <RequireAuth>
            <RequireAdmin>
              <UsersSettingsPage />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  // Pick up the API key from the Electron preload (null in a plain browser).
  useEffect(() => {
    const bridge = (window as any).fuego;
    if (bridge?.getLaunchInfo) {
      bridge
        .getLaunchInfo()
        .then((info: { apiKey: string | null }) => setApiKey(info.apiKey))
        .catch(() => setApiKey(null));
    } else {
      setApiKey(null);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <ToastViewport />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
