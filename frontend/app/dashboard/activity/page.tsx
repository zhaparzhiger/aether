"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity as ActivityIcon,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  activityApi,
  ActivityAction,
  ActivityEntry,
  ActivityMember,
  MemberQuestion,
  ApiError,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS } from "@/lib/roles";
import { cn } from "@/lib/utils";

const ACTION_META: Record<ActivityAction, { label: string; icon: typeof Upload }> = {
  chat_question: { label: "Вопрос к ИИ", icon: MessageSquare },
  document_upload: { label: "Загрузка документа", icon: Upload },
  document_delete: { label: "Удаление документа", icon: Trash2 },
  document_download: { label: "Скачивание документа", icon: Download },
  summary_generate: { label: "Пересказ документа", icon: Sparkles },
};

type Period = "7" | "30" | "all";

function periodFrom(period: Period): string | undefined {
  if (period === "all") return undefined;
  const d = new Date();
  d.setDate(d.getDate() - Number(period));
  return d.toISOString();
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActivityPage() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg!.organizationId;

  const [members, setMembers] = useState<ActivityMember[] | null>(null);
  const [selected, setSelected] = useState<ActivityMember | null>(null);

  useEffect(() => {
    activityApi
      .members(orgId)
      .then((res) => setMembers(res.members))
      .catch((err) =>
        toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить активность")
      );
  }, [orgId]);

  const sorted = useMemo(
    () =>
      members
        ? [...members].sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""))
        : null,
    [members]
  );

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Активность команды</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Запросы к ИИ, операции с документами и последняя активность сотрудников. Данные видны
          ролям Менеджер и выше и используются только в рабочих целях.
        </p>
      </div>

      {!sorted ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">В организации пока нет активных участников.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Сотрудник</TableHead>
              <TableHead className="text-right">Вопросы к ИИ</TableHead>
              <TableHead className="text-right">Загрузки</TableHead>
              <TableHead className="text-right">Скачивания</TableHead>
              <TableHead>Последняя активность</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((m) => (
              <TableRow
                key={m.userId}
                className="cursor-pointer"
                onClick={() => setSelected(m)}
                title="Открыть детальную активность"
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={m.avatarUrl ?? undefined} />
                      <AvatarFallback>{m.name[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ROLE_LABELS[m.role]} · {m.email}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{m.questions}</TableCell>
                <TableCell className="text-right tabular-nums">{m.uploads}</TableCell>
                <TableCell className="text-right tabular-nums">{m.downloads}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(m.lastActivity)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <MemberDetailDialog orgId={orgId} member={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function MemberDetailDialog({
  orgId,
  member,
  onClose,
}: {
  orgId: string;
  member: ActivityMember | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"questions" | "log">("questions");
  const [period, setPeriod] = useState<Period>("30");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [questions, setQuestions] = useState<MemberQuestion[] | null>(null);
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!member) return;
    const from = periodFrom(period);
    try {
      if (tab === "questions") {
        setQuestions(null);
        const res = await activityApi.questions(orgId, member.userId, { from });
        setQuestions(res.questions);
      } else {
        setEntries(null);
        const res = await activityApi.log(orgId, {
          userId: member.userId,
          action: actionFilter === "all" ? undefined : actionFilter,
          from,
        });
        setEntries(res.entries);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить данные");
    }
  }, [orgId, member, tab, period, actionFilter]);

  useEffect(() => {
    setExpanded(null);
    load();
  }, [load]);

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 pr-8">
            <Avatar className="h-10 w-10">
              <AvatarImage src={member?.avatarUrl ?? undefined} />
              <AvatarFallback>{member?.name[0]?.toUpperCase() ?? "?"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <DialogTitle className="truncate">{member?.name}</DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {member ? `${ROLE_LABELS[member.role]} · ${member.email}` : ""}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "questions" | "log")}>
            <TabsList className="h-8">
              <TabsTrigger value="questions" className="h-6 px-2.5 text-xs">
                Вопросы к ИИ
              </TabsTrigger>
              <TabsTrigger value="log" className="h-6 px-2.5 text-xs">
                Действия
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-2">
            {tab === "log" && (
              <Select
                value={actionFilter}
                onValueChange={(v) => setActionFilter(v ?? "all")}
                items={{
                  all: "Все действия",
                  ...Object.fromEntries(
                    Object.entries(ACTION_META).map(([k, v]) => [k, v.label])
                  ),
                }}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все действия</SelectItem>
                  {Object.entries(ACTION_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={period}
              onValueChange={(v) => setPeriod((v as Period) ?? "30")}
              items={{ "7": "За 7 дней", "30": "За 30 дней", all: "За всё время" }}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">За 7 дней</SelectItem>
                <SelectItem value="30">За 30 дней</SelectItem>
                <SelectItem value="all">За всё время</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-lg border bg-muted/30">
          {tab === "questions" ? (
            !questions ? (
              <LoadingRow />
            ) : questions.length === 0 ? (
              <EmptyRow text="За выбранный период вопросов не было." />
            ) : (
              <ul className="divide-y">
                {questions.map((q, i) => (
                  <li key={i} className="p-3">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setExpanded(expanded === i ? null : i)}
                      title={expanded === i ? "Скрыть ответ" : "Показать ответ"}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm font-medium">{q.question}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDateTime(q.askedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">Чат: {q.chatTitle}</p>
                    </button>
                    {expanded === i && (
                      <div className="mt-2 rounded-md bg-background p-3 text-sm leading-relaxed whitespace-pre-wrap">
                        {q.answer ?? "Ответ не был получен."}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : !entries ? (
            <LoadingRow />
          ) : entries.length === 0 ? (
            <EmptyRow text="За выбранный период действий не было." />
          ) : (
            <ul className="divide-y">
              {entries.map((e) => {
                const meta = ACTION_META[e.action] ?? {
                  label: e.action,
                  icon: ActivityIcon,
                };
                const Icon = meta.icon;
                return (
                  <li key={e.id} className="flex items-center gap-3 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {meta.label}
                        {e.metadata?.name && (
                          <span className="text-muted-foreground"> — {e.metadata.name}</span>
                        )}
                      </p>
                      {e.metadata?.question && (
                        <p className="truncate text-xs text-muted-foreground">
                          «{e.metadata.question}»
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(e.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {member && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> {member.questions} вопросов
            </span>
            <span className="flex items-center gap-1">
              <Upload className="h-3 w-3" /> {member.uploads} загрузок
            </span>
            <span className="flex items-center gap-1">
              <Download className="h-3 w-3" /> {member.downloads} скачиваний
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Загрузка...
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <FileText className="h-4 w-4" />
      {text}
    </div>
  );
}
