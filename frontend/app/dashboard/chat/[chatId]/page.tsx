"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Send, FileText, Star, Download, Eye, Paperclip, X, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  chatApi,
  documentsApi,
  DocumentItem,
  Message,
  MessageSource,
  ChatMeta,
  AnswerMode,
  ApiError,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { docType } from "@/lib/doc-type";
import {
  DocumentPreviewDialog,
  PreviewTarget,
} from "@/components/dashboard/document-preview-dialog";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

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

  const [previewDoc, setPreviewDoc] = useState<PreviewTarget | null>(null);
  const [attachedDoc, setAttachedDoc] = useState<DocumentItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [docs, setDocs] = useState<DocumentItem[] | null>(null);
  const [docFilter, setDocFilter] = useState("");

  function openSourcePreview(s: MessageSource) {
    setPreviewDoc({ id: s.documentId, name: s.filename });
  }

  async function togglePicker() {
    const next = !pickerOpen;
    setPickerOpen(next);
    if (next && docs === null) {
      try {
        const { documents } = await documentsApi.list(orgId);
        setDocs(documents.filter((d) => d.status === "ready"));
      } catch {
        setDocs([]);
        toast.error("Не удалось загрузить список документов");
      }
    }
  }

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

    const attachment = attachedDoc;
    setInput("");
    setAttachedDoc(null);
    setPickerOpen(false);
    setSending(true);
    const optimisticUser: Message = {
      id: `optimistic-${Date.now()}`,
      chatId,
      role: "user",
      content,
      sources: attachment
        ? [{ documentId: attachment.id, filename: attachment.originalName, pageNumber: null }]
        : null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const { userMessage, assistantMessage } = await chatApi.send(orgId, chatId, content, {
        mode,
        documentId: attachment?.id,
      });
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUser.id),
        userMessage,
        assistantMessage,
      ]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось отправить сообщение");
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      setInput(content);
      setAttachedDoc(attachment);
    } finally {
      setSending(false);
    }
  }

  const readOnly = chatMeta ? !chatMeta.isOwn : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {chatMeta && (
        <div className="flex items-center justify-between gap-2 border-b px-2 py-2 sm:px-4">
          <Link
            href="/dashboard/chat"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            title="К списку чатов"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
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
                  chatMeta.isShared ? "fill-foreground text-foreground" : "text-muted-foreground"
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

      <ScrollArea className="min-h-0 flex-1 overflow-hidden p-4">
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
              {m.sources && m.sources.length > 0 && (
                <div
                  className={cn(
                    "flex flex-wrap gap-1",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {m.sources.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => openSourcePreview(s)}
                      title="Открыть превью документа"
                      className="cursor-pointer"
                    >
                      <Badge
                        variant="outline"
                        className="gap-1 text-xs font-normal transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                      >
                        {m.role === "user" ? (
                          <Paperclip className="h-3 w-3" />
                        ) : (
                          <FileText className="h-3 w-3" />
                        )}
                        {s.filename}
                        {s.pageNumber ? `, стр. ${s.pageNumber}` : ""}
                      </Badge>
                    </button>
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
          <div className="relative mx-auto max-w-3xl space-y-2">
            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                <div className="absolute bottom-full left-0 right-0 z-20 mb-2 rounded-xl border bg-popover p-3 shadow-lg">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Прикрепить документ</p>
                    <Input
                      value={docFilter}
                      onChange={(e) => setDocFilter(e.target.value)}
                      placeholder="Поиск..."
                      className="h-7 w-40 text-xs"
                    />
                  </div>
                  {docs === null ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Загружаем документы...
                    </div>
                  ) : docs.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Нет готовых документов — загрузите их на странице «Документы».
                    </p>
                  ) : (
                    <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto md:grid-cols-3">
                      {docs
                        .filter((d) =>
                          d.originalName.toLowerCase().includes(docFilter.trim().toLowerCase())
                        )
                        .map((d) => {
                          const type = docType({ mimeType: d.mimeType, name: d.originalName });
                          const TypeIcon = type.icon;
                          const selected = attachedDoc?.id === d.id;
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => {
                                setAttachedDoc(d);
                                setPickerOpen(false);
                              }}
                              className={cn(
                                "flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-accent",
                                selected && "border-primary bg-primary/5"
                              )}
                            >
                              <div
                                className={cn(
                                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                                  type.bg
                                )}
                              >
                                <TypeIcon className={cn("h-4 w-4", type.text)} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium">{d.originalName}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {type.label} · {formatSize(d.sizeBytes)}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              </>
            )}

            {attachedDoc && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5">
                {(() => {
                  const type = docType({
                    mimeType: attachedDoc.mimeType,
                    name: attachedDoc.originalName,
                  });
                  const TypeIcon = type.icon;
                  return (
                    <div
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                        type.bg
                      )}
                    >
                      <TypeIcon className={cn("h-3.5 w-3.5", type.text)} />
                    </div>
                  );
                })()}
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {attachedDoc.originalName}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  title="Убрать документ"
                  onClick={() => setAttachedDoc(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Прикрепить документ к вопросу"
                onClick={togglePicker}
                className={cn(pickerOpen && "border-primary/50 bg-primary/5 text-primary")}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  attachedDoc
                    ? `Спросите о «${attachedDoc.originalName}»... например: «Что написано в этом документе кратко?»`
                    : "Задайте вопрос о документах компании... («Запомни: ...» — добавит факт в память)"
                }
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

      <DocumentPreviewDialog orgId={orgId} target={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}
