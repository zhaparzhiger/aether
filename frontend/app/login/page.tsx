"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { authApi, invitesApi, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { GoogleButton } from "@/components/auth/google-button";
import { getPendingInvite, clearPendingInvite } from "@/lib/pending-invite";

export default function LoginPage() {
  const router = useRouter();
  const { refresh, setCurrentOrgId } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function afterLogin() {
    const pendingToken = getPendingInvite();
    if (pendingToken) {
      try {
        const { member } = await invitesApi.accept(pendingToken);
        clearPendingInvite();
        await refresh();
        setCurrentOrgId(member.organizationId);
        router.push("/dashboard/chat");
        return;
      } catch {
        clearPendingInvite();
      }
    }
    await refresh();
    router.push("/dashboard/chat");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.login({ email, password });
      await afterLogin();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle(idToken: string) {
    try {
      await authApi.google(idToken);
      await afterLogin();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось войти через Google");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Вход в Aether</CardTitle>
          <CardDescription>Корпоративный ИИ-ассистент вашей компании</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <GoogleButton onCredential={handleGoogle} />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Separator className="flex-1" />
            или
            <Separator className="flex-1" />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Входим..." : "Войти"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Нет аккаунта?{" "}
            <Link href="/register" className="underline">
              Зарегистрироваться
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
