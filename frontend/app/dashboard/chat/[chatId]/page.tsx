"use client";

import { use, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, FileText, Star, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { chatApi, Message, ChatMeta, AnswerMode, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export default function ChatThreadPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params);
  const { currentOrg } = useAuth();
  const orgId = currentOrg!.organizationId;

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatMeta, setChatMeta] = useState<ChatMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<AnswerMode>("detailed");
  const [togglingShare, setTogglingShare] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    chatApi
      .messages(orgId, chatId)
      .then((res) => {
        setMessages(res.messages);
        setChatMeta(res.chat);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить сообщения"))
      .finally(() => setLoading(false));
  }, [orgId, chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleToggleShare() {
    if (!chatMeta || togglingShare) return;
    setTogglingShare(true);
    try {
      const { chat } = await chatApi.update(orgId, chatId, { isShared: !chatMeta.isShared });
      setChatMeta({ ...chatMeta, isShared: chat.isShared ?? false });
      toast.success(
        chat.isShared
          ? "Чат отмечен как важный — теперь он виден всей команде"
          : "Чат больше не отображается как важный"
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось изменить чат");
    } finally {
      setTogglingShare(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    setInput("");
    setSending(true);
    const optimisticUser: Message = {
      id: `optimistic-${Date.now()}`,
      chatId,
      role: "user",
      content,
      sources: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const { userMessage, assistantMessage } = await chatApi.send(orgId, chatId, content, { mode });
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUser.id),
        userMessage,
        assistantMessage,
      ]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось отправить сообщение");
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  const readOnly = chatMeta ? !chatMeta.isOwn : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {chatMeta && (
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{chatMeta.title}</p>
            {readOnly && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="h-3 w-3" />
                Чат пользователя {chatMeta.authorName} — только просмотр
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={handleToggleShare}
              disabled={togglingShare || readOnly}
              title={
                chatMeta.isShared
                  ? "Убрать из важных"
                  : "Отметить как важный — его увидит вся команда"
              }
            >
              <Star
                className={cn(
                  "h-4 w-4",
                  chatMeta.isShared ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                )}
              />
              {chatMeta.isShared ? "Важный" : "В важные"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    <Download className="h-4 w-4" />
                    Экспорт
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => window.open(chatApi.exportUrl(orgId, chatId, "pdf"), "_blank")}
                >
                  Скачать PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => window.open(chatApi.exportUrl(orgId, chatId, "docx"), "_blank")}
                >
                  Скачать Word (DOCX)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {loading && <p className="text-sm text-muted-foreground">Загрузка...</p>}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                )}
              >
                {m.content}
              </div>
              {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.sources.map((s, i) => (
                    <Badge key={i} variant="outline" className="gap-1 text-xs font-normal">
                      <FileText className="h-3 w-3" />
                      {s.filename}
                      {s.pageNumber ? `, стр. ${s.pageNumber}` : ""}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex items-start">
              <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
                Печатает...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {!readOnly && (
        <form onSubmit={handleSend} className="border-t p-4">
          <div className="mx-auto max-w-3xl space-y-2">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Задайте вопрос о документах компании... («Запомни: ...» — добавит факт в память)"
                className="min-h-[44px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
              />
              <Button type="submit" size="icon" disabled={sending || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <Tabs value={mode} onValueChange={(v) => setMode(v as AnswerMode)}>
              <TabsList className="h-7">
                <TabsTrigger value="short" className="h-5 px-2 text-xs">
                  Краткий
                </TabsTrigger>
                <TabsTrigger value="detailed" className="h-5 px-2 text-xs">
                  Подробный
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </form>
      )}
    </div>
  );
}
