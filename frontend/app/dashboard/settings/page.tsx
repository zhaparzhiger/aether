"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Brain, Trash2, Plus, Scale, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { memoryApi, MemoryFact, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS, hasRole } from "@/lib/roles";
import { LEGAL_VERSION, LEGAL_DATE } from "@/lib/legal";

export default function SettingsPage() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg!.organizationId;
  const canDeleteAny = hasRole(currentOrg?.role, "admin");
  const isAdmin = hasRole(currentOrg?.role, "admin");

  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [newFact, setNewFact] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const { facts } = await memoryApi.list(orgId);
      setFacts(facts);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить память компании");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const content = newFact.trim();
    if (!content) return;
    setAdding(true);
    try {
      await memoryApi.create(orgId, content);
      setNewFact("");
      toast.success("Факт добавлен в память компании");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось добавить факт");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await memoryApi.remove(orgId, id);
      toast.success("Факт удалён");
      setFacts((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось удалить факт");
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Настройки организации</h1>

      <Card>
        <CardHeader>
          <CardTitle>{currentOrg?.organizationName}</CardTitle>
          <CardDescription>Ваша роль: {currentOrg ? ROLE_LABELS[currentOrg.role] : ""}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Идентификатор организации: {currentOrg?.organizationSlug}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Память компании
          </CardTitle>
          <CardDescription>
            Факты, которые ИИ учитывает во всех ответах. Их можно добавлять здесь или прямо в чате:
            «Запомни: наш основной офис в Астане».
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              placeholder="Например: рабочая неделя — с понедельника по пятницу"
              className="flex-1"
            />
            <Button type="submit" disabled={adding || !newFact.trim()} size="icon" title="Добавить факт">
              <Plus className="h-4 w-4" />
            </Button>
          </form>

          {facts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Память пока пуста.</p>
          ) : (
            <ul className="space-y-2">
              {facts.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="text-sm">{f.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {f.createdByName ?? "—"} · {new Date(f.createdAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  {canDeleteAny && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleDelete(f.id)}
                      title="Удалить факт"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-muted-foreground" />
              Правовая информация
            </CardTitle>
            <CardDescription>
              Документы, регулирующие использование сервиса и обработку данных. Версия{" "}
              {LEGAL_VERSION} от {LEGAL_DATE}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {[
                { href: "/legal/terms", label: "Условия использования" },
                { href: "/legal/privacy", label: "Политика конфиденциальности" },
                { href: "/legal/dpa", label: "Соглашение об обработке данных (DPA)" },
              ].map((doc) => (
                <li key={doc.href}>
                  <Link
                    href={doc.href}
                    target="_blank"
                    className="flex items-center gap-2 text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    {doc.label}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
