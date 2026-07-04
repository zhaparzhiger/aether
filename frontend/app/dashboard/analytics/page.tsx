"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, MessageSquare, HelpCircle, Users, Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyticsApi, AnalyticsData, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

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
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-semibold">Аналитика</h1>
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  const maxDayCount = Math.max(1, ...data.questionsByDay.map((d) => d.count));

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-semibold">Аналитика</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {STAT_CARDS.map(({ key, label, icon: Icon }) => (
          <Card key={key} className="py-4">
            <CardContent className="flex items-center gap-3 px-4">
              <Icon className="h-8 w-8 shrink-0 text-primary" />
              <div>
                <p className="text-2xl font-semibold leading-none">{data.counts[key]}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
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
              <ol className="space-y-2">
                {data.popularQuestions.map((q, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate" title={q.question}>
                      {i + 1}. {q.question}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">×{q.count}</span>
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
              <ol className="space-y-2">
                {data.topDocuments.map((d, i) => (
                  <li key={d.documentId} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate" title={d.filename}>
                      {i + 1}. {d.filename}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {d.citations} цитирований
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
              <div className="flex h-32 items-end gap-1">
                {data.questionsByDay.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.count}`}>
                    <span className="text-xs text-muted-foreground">{d.count}</span>
                    <div
                      className="w-full rounded-t bg-primary/70"
                      style={{ height: `${Math.max(6, (d.count / maxDayCount) * 90)}px` }}
                    />
                    <span className="text-[10px] text-muted-foreground">{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
