"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { invitesApi, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS } from "@/lib/roles";
import { setPendingInvite } from "@/lib/pending-invite";

interface InviteInfo {
  role: "owner" | "admin" | "manager" | "member";
  status: string;
  invitedEmail: string;
  organizationName: string;
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { user, loading: authLoading, refresh, setCurrentOrgId } = useAuth();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    invitesApi
      .get(token)
      .then((res) => setInvite(res.invite))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Приглашение не найдено"));
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    try {
      const { member } = await invitesApi.accept(token);
      await refresh();
      setCurrentOrgId(member.organizationId);
      router.push("/dashboard/chat");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось принять приглашение");
    } finally {
      setAccepting(false);
    }
  }

  function goAuth(path: "/login" | "/register") {
    setPendingInvite(token);
    router.push(path);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Приглашение в Aether</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          {!error && !invite && <p className="text-sm text-muted-foreground">Загрузка...</p>}

          {invite && invite.status === "active" && (
            <p className="text-sm text-muted-foreground">Это приглашение уже принято.</p>
          )}

          {invite && invite.status !== "active" && (
            <>
              <CardDescription>
                Вас пригласили присоединиться к организации{" "}
                <b>{invite.organizationName}</b> в роли <b>{ROLE_LABELS[invite.role]}</b>
                <br />
                Приглашение отправлено на: {invite.invitedEmail}
              </CardDescription>

              {authLoading ? null : user ? (
                <Button className="w-full" onClick={handleAccept} disabled={accepting}>
                  {accepting ? "Принимаем..." : "Принять приглашение"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button className="w-full" onClick={() => goAuth("/register")}>
                    Зарегистрироваться и принять
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => goAuth("/login")}>
                    У меня уже есть аккаунт
                  </Button>
                </div>
              )}
            </>
          )}

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="underline">
              На главную
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
