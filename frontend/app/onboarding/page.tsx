"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { organizationsApi, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, organizations, loading, refresh, setCurrentOrgId } = useAuth();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && organizations.length > 0) {
      setCurrentOrgId(organizations[0].organizationId);
      router.replace("/dashboard/chat");
    }
  }, [loading, organizations, router, setCurrentOrgId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { organization } = await organizationsApi.create(name);
      await refresh();
      setCurrentOrgId(organization.id);
      router.push("/dashboard/chat");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать организацию");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || organizations.length > 0) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Создайте организацию</CardTitle>
          <CardDescription>
            Вы станете владельцем организации и сможете пригласить коллег.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название компании</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ТОО «Моя компания»"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Создаём..." : "Создать организацию"}
            </Button>
          </form>
          <div className="mt-4 border-t pt-4">
            <p className="mb-2 text-center text-xs text-muted-foreground">
              Вы сотрудник и вас пригласят в существующую организацию?
            </p>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => router.push("/dashboard/chat")}
            >
              Пропустить этот шаг
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
