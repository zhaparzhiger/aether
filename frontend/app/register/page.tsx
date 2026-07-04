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

export default function RegisterPage() {
  const router = useRouter();
  const { refresh, setCurrentOrgId } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function afterAuth() {
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
    router.push("/onboarding");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.register({ name, email, password });
      await afterAuth();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось зарегистрироваться");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle(idToken: string) {
    try {
      await authApi.google(idToken);
      await afterAuth();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось войти через Google");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Регистрация в Aether</CardTitle>
          <CardDescription>Создайте аккаунт, чтобы начать работу</CardDescription>
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
              <Label htmlFor="name">Имя</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
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
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Создаём аккаунт..." : "Зарегистрироваться"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="underline">
              Войти
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
