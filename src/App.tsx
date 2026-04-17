import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import Auth from "./pages/Auth";
import DashboardHome from "./pages/DashboardHome";
import TeamPage from "./pages/TeamPage";
import BulkManager from "./pages/BulkManager";
import SubdomainRedirects from "./pages/SubdomainRedirects";
import BulkRedirects from "./pages/BulkRedirects";
import RedirectRules from "./pages/RedirectRules";
import RedirectHistory from "./pages/RedirectHistory";
import Settings from "./pages/Settings";
import AdminPanel from "./pages/AdminPanel";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const wrap = (page: React.ReactNode, gated = true) => (
  <ProtectedRoute>
    <AppLayout>{gated ? <SubscriptionGate>{page}</SubscriptionGate> : page}</AppLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/app" element={wrap(<DashboardHome />, false)} />
            <Route path="/app/bulk" element={wrap(<BulkManager />)} />
            <Route path="/app/subdomain-redirects" element={wrap(<SubdomainRedirects />)} />
            <Route path="/app/bulk-redirects" element={wrap(<BulkRedirects />)} />
            <Route path="/app/redirect-rules" element={wrap(<RedirectRules />)} />
            <Route path="/app/redirect-history" element={wrap(<RedirectHistory />, false)} />
            <Route path="/app/team" element={wrap(<TeamPage />, false)} />
            <Route path="/app/settings" element={wrap(<Settings />, false)} />
            <Route path="/app/admin" element={
              <ProtectedRoute requireAdmin>
                <AppLayout><AdminPanel /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
