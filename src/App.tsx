import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import DashboardHome from "./pages/DashboardHome";
import TeamPage from "./pages/TeamPage";
import BulkManager from "./pages/BulkManager";
import SubdomainRedirects from "./pages/SubdomainRedirects";
import BulkRedirects from "./pages/BulkRedirects";
import RedirectHistory from "./pages/RedirectHistory";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
            <Route path="/app" element={<AppLayout><DashboardHome /></AppLayout>} />
            <Route path="/app/bulk" element={<AppLayout><BulkManager /></AppLayout>} />
            <Route path="/app/subdomain-redirects" element={<AppLayout><SubdomainRedirects /></AppLayout>} />
            <Route path="/app/bulk-redirects" element={<AppLayout><BulkRedirects /></AppLayout>} />
            <Route path="/app/redirect-history" element={<AppLayout><RedirectHistory /></AppLayout>} />
            <Route path="/app/team" element={<AppLayout><TeamPage /></AppLayout>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
