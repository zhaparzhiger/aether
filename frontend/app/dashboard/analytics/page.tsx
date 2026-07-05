"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, MessageSquare, HelpCircle, Users, Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyticsApi, AnalyticsData, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const STAT_CARDS: {
  key: keyof AnalyticsData["counts"];
  label: string;
  icon: typeof FileText;
}[] = [
  { key: "documents", label: "Документов", icon: FileText },
  { key: "chats", label: "Чатов", icon: MessageSquare },
  { key: "questions", label: "Вопросов задано", icon: HelpCircle },
  { key: "members", label: "Сотрудников", icon: Users },
  { key: "memoryFacts", label: "Фактов в памяти", icon: Brain },
];

export default function AnalyticsPage() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg!.organizationId;
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    analyticsApi
      .get(orgId)
      .then(setData)
      .catch((err) =>
        toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить аналитику")
      );
  }, [orgId]);

  if (!data) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="mb-6 text-2xl font-semibold">Аналитика</h1>
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  const maxDayCount = Math.max(1, ...data.questionsByDay.map((d) => d.count));

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-6 text-2xl font-semibold">Аналитика</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {STAT_CARDS.map(({ key, label, icon: Icon }) => (
          <Card key={key} className="py-4">
            <CardContent className="flex items-center gap-3 px-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Icon className="h-5 w-5 text-foreground/70" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold leading-none tracking-tight tabular-nums">
                  {data.counts[key]}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Популярные вопросы</CardTitle>
          </CardHeader>
          <CardContent>
            {data.popularQuestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет вопросов</p>
            ) : (
              <ol className="space-y-1">
                {data.popularQuestions.map((q, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/60"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-medium text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={q.question}>
                      {q.question}
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                      {q.count}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Самые используемые документы</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Документы ещё не цитировались в ответах</p>
            ) : (
              <ol className="space-y-1">
                {data.topDocuments.map((d, i) => (
                  <li
                    key={d.documentId}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/60"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-medium text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={d.filename}>
                      {d.filename}
                    </span>
                    <span
                      className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums"
                      title={`${d.citations} цитирований`}
                    >
                      {d.citations}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Вопросы за последние 14 дней</CardTitle>
          </CardHeader>
          <CardContent>
            {data.questionsByDay.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет данных</p>
            ) : (
              <div>
                <div className="flex h-36 items-end gap-1.5 border-b pb-px sm:gap-2">
                  {data.questionsByDay.map((d) => (
                    <div
                      key={d.day}
                      className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
                      title={`${d.day}: ${d.count} вопросов`}
                    >
                      <span className="text-xs text-muted-foreground tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
                        {d.count}
                      </span>
                      <div
                        className={cn(
                          "w-full max-w-8 rounded-t-md transition-colors",
                          d.count === 0
                            ? "bg-muted"
                            : "bg-foreground/60 group-hover:bg-foreground/85"
                        )}
                        style={{ height: `${Math.max(4, (d.count / maxDayCount) * 100)}px` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex gap-1.5 sm:gap-2">
                  {data.questionsByDay.map((d, i) => (
                    <span
                      key={d.day}
                      className={cn(
                        "flex-1 text-center text-[10px] text-muted-foreground tabular-nums",
                        i % 2 !== 0 && "max-sm:invisible"
                      )}
                    >
                      {d.day.slice(5).replace("-", ".")}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
