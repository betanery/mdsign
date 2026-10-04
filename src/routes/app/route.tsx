import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AuthProvider } from "@/app/auth";
import { AppI18nProvider } from "@/app/i18n";
import { Toaster } from "@/components/ui/sonner";

// Aplicação MDSign (Fase 2). Renderiza só no navegador: a sessão do Supabase vive
// no navegador e estas páginas não são indexadas.
export const Route = createFileRoute("/app")({
  ssr: false,
  head: () => ({
    meta: [{ title: "MDSign" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AppRoot,
});

function AppRoot() {
  return (
    <AppI18nProvider>
      <AuthProvider>
        <Outlet />
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </AppI18nProvider>
  );
}
