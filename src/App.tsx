import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { RequireAuth } from "@/components/auth/RequireAuth";

import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import NoticiaPage from "./pages/NoticiaPage";
import CategoriaPage from "./pages/CategoriaPage";
import UltimasPage from "./pages/UltimasPage";
import BuscaPage from "./pages/BuscaPage";
import EnviarDenunciaPage from "./pages/EnviarDenunciaPage";
import AuthPage from "./pages/AuthPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminPosts from "./pages/admin/AdminPosts";
import AdminPostEditor from "./pages/admin/AdminPostEditor";
import AdminCategorias from "./pages/admin/AdminCategorias";
import AdminBanners from "./pages/admin/AdminBanners";
import AdminDenuncias from "./pages/admin/AdminDenuncias";
import AdminUsuarios from "./pages/admin/AdminUsuarios";
import AdminFontes from "./pages/admin/AdminFontes";
import AdminInstagram from "./pages/admin/AdminInstagram";
import AdminImportarInstagram from "./pages/admin/AdminImportarInstagram";
import AdminControleHome from "./pages/admin/AdminControleHome";
import AdminConfiguracoes from "./pages/admin/AdminConfiguracoes";
import AdminSync from "./pages/admin/AdminSync";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* AuthProvider wraps all routes so useAuth works in headers/layouts */}
            <Route path="/" element={<Index />} />
            <Route path="/ultimas" element={<UltimasPage />} />
            <Route path="/busca" element={<BuscaPage />} />
            <Route path="/categoria/:slug" element={<CategoriaPage />} />
            <Route path="/noticia/:slug" element={<NoticiaPage />} />
            <Route path="/materia/:slug" element={<NoticiaPage />} />
            <Route path="/denuncias/enviar" element={<EnviarDenunciaPage />} />
            <Route path="/auth" element={<AuthPage />} />

            <Route path="/admin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
            <Route path="/painel" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
            <Route path="/admin/revisao" element={<RequireAuth staffOnly><AdminPosts /></RequireAuth>} />
            <Route path="/admin/posts" element={<RequireAuth staffOnly><AdminPosts /></RequireAuth>} />
            <Route path="/admin/posts/novo" element={<RequireAuth staffOnly><AdminPostEditor /></RequireAuth>} />
            <Route path="/admin/posts/:id" element={<RequireAuth staffOnly><AdminPostEditor /></RequireAuth>} />
            <Route path="/admin/categorias" element={<RequireAuth staffOnly><AdminCategorias /></RequireAuth>} />
            <Route path="/admin/banners" element={<RequireAuth adminOnly><AdminBanners /></RequireAuth>} />
            <Route path="/admin/denuncias" element={<RequireAuth staffOnly><AdminDenuncias /></RequireAuth>} />
            <Route path="/admin/fontes" element={<RequireAuth staffOnly><AdminFontes /></RequireAuth>} />
            <Route path="/admin/instagram" element={<RequireAuth staffOnly><AdminInstagram /></RequireAuth>} />
            <Route path="/admin/importar-instagram" element={<RequireAuth staffOnly><AdminImportarInstagram /></RequireAuth>} />
            <Route path="/admin/usuarios" element={<RequireAuth adminOnly><AdminUsuarios /></RequireAuth>} />
            <Route path="/admin/home" element={<RequireAuth staffOnly><AdminControleHome /></RequireAuth>} />
            <Route path="/admin/configuracoes" element={<RequireAuth adminOnly><AdminConfiguracoes /></RequireAuth>} />
            <Route path="/admin/sync" element={<RequireAuth staffOnly><AdminSync /></RequireAuth>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
