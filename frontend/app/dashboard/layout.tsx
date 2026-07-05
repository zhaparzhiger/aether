"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DisclaimerBanner } from "@/components/legal/disclaimer-banner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, organizations, currentOrg, loading, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  // сотрудник без организации: ждёт приглашения (создание компании — опционально)
  if (organizations.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Building2 className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold">Вы пока не состоите в организации</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Попросите администратора вашей компании отправить приглашение на{" "}
          <span className="font-medium text-foreground">{user.email}</span> — после принятия
          приглашения здесь появится рабочее пространство. Либо создайте собственную организацию.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={() => router.push("/onboarding")}>Создать организацию</Button>
          <Button
            variant="outline"
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
          >
            Выйти
          </Button>
        </div>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar className="hidden md:flex" />

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileNavOpen(false)}
          />
          <Sidebar
            className="relative z-10 h-full w-64 shadow-xl"
            onNavigate={() => setMobileNavOpen(false)}
          />
        </div>
      )}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b px-2 py-1.5 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileNavOpen(true)}
            title="Открыть меню"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="truncate text-sm font-semibold">{currentOrg.organizationName}</span>
        </div>
        <DisclaimerBanner />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
