"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Folder, FolderOpen, Files, Trash2, Download, Sparkles, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  collectionsApi,
  documentsApi,
  legalApi,
  Collection,
  DocumentItem,
  DocumentStatus,
  ApiError,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { hasRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { docType } from "@/lib/doc-type";
import { UPLOAD_TERMS_DOCUMENT } from "@/lib/legal";
import {
  DocumentPreviewDialog,
  PreviewTarget,
} from "@/components/dashboard/document-preview-dialog";
import {
  DocumentSummaryDialog,
  SummaryTarget,
} from "@/components/dashboard/document-summary-dialog";

const STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: "В очереди",
  processing: "Обрабатывается",
  ready: "Готов",
  failed: "Ошибка",
};

const STATUS_VARIANT: Record<DocumentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  processing: "secondary",
  ready: "default",
  failed: "destructive",
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

// selected collection: "all" | "none" (без коллекции) | collection id
type CollectionFilter = "all" | "none" | string;

export default function DocumentsPage() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg!.organizationId;
  const canManage = hasRole(currentOrg?.role, "manager");
  const canAdmin = hasRole(currentOrg?.role, "admin");

  const [collections, setCollections] = useState<Collection[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCollection, setActiveCollection] = useState<CollectionFilter>("all");

  const [previewDoc, setPreviewDoc] = useState<PreviewTarget | null>(null);
  const [summaryDoc, setSummaryDoc] = useState<SummaryTarget | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocumentItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // drag & drop: документ тянут за «ручку» на карточке и бросают в коллекцию
  const [draggingDoc, setDraggingDoc] = useState<DocumentItem | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCollection, setUploadCollection] = useState<string>("none");
  const [uploading, setUploading] = useState(false);
  // null = not loaded yet; false = the terms checkbox must be shown and checked
  const [hasUploadConsent, setHasUploadConsent] = useState<boolean | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDescription, setNewCollectionDescription] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  async function loadAll() {
    try {
      const [c, d] = await Promise.all([collectionsApi.list(orgId), documentsApi.list(orgId)]);
      setCollections(c.collections);
      setDocuments(d.documents);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить документы");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    if (canManage) {
      legalApi
        .myConsents(orgId)
        .then(({ consents }) =>
          setHasUploadConsent(consents.some((c) => c.document === UPLOAD_TERMS_DOCUMENT))
        )
        .catch(() => setHasUploadConsent(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    const hasPending = documents.some((d) => d.status === "pending" || d.status === "processing");
    if (!hasPending) return;
    const id = setInterval(async () => {
      const { documents } = await documentsApi.list(orgId);
      setDocuments(documents);
    }, 3000);
    return () => clearInterval(id);
  }, [documents, orgId]);

  function openUpload() {
    // pre-select the collection the user is currently viewing
    setUploadCollection(activeCollection === "all" ? "none" : activeCollection);
    setUploadOpen(true);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error("Выберите файл");
      return;
    }
    if (hasUploadConsent === false && !termsAccepted) {
      toast.error("Отметьте согласие с условиями обработки данных");
      return;
    }
    setUploading(true);
    try {
      await documentsApi.upload(orgId, file, {
        collectionId: uploadCollection === "none" ? undefined : uploadCollection,
        acceptTerms: hasUploadConsent === false && termsAccepted,
      });
      setHasUploadConsent(true);
      toast.success("Документ загружен и отправлен на обработку");
      setUploadOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить документ");
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    setCreatingCollection(true);
    try {
      await collectionsApi.create(orgId, {
        name: newCollectionName,
        description: newCollectionDescription || undefined,
      });
      toast.success("Коллекция создана");
      setCollectionDialogOpen(false);
      setNewCollectionName("");
      setNewCollectionDescription("");
      loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать коллекцию");
    } finally {
      setCreatingCollection(false);
    }
  }

  async function handleDeleteCollection(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Удалить коллекцию? Документы останутся, но окажутся вне коллекции.")) return;
    try {
      await collectionsApi.remove(orgId, id);
      toast.success("Коллекция удалена");
      if (activeCollection === id) setActiveCollection("all");
      loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось удалить коллекцию");
    }
  }

  async function confirmDelete() {
    if (!deleteDoc || deleting) return;
    setDeleting(true);
    try {
      await documentsApi.remove(orgId, deleteDoc.id);
      toast.success("Документ удалён");
      setDeleteDoc(null);
      loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось удалить документ");
    } finally {
      setDeleting(false);
    }
  }

  async function handleMove(doc: DocumentItem, collectionId: string | null) {
    setDraggingDoc(null);
    setDragOverTarget(null);
    if ((doc.collectionId ?? null) === collectionId) return;

    const prev = documents;
    setDocuments((ds) => ds.map((x) => (x.id === doc.id ? { ...x, collectionId } : x)));
    try {
      await documentsApi.move(orgId, doc.id, collectionId);
      toast.success(
        collectionId
          ? `Документ перемещён в «${collections.find((c) => c.id === collectionId)?.name ?? "коллекцию"}»`
          : "Документ убран из коллекции"
      );
    } catch (err) {
      setDocuments(prev);
      toast.error(err instanceof ApiError ? err.message : "Не удалось переместить документ");
    }
  }

  function dropTargetProps(targetId: string, collectionId: string | null) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!draggingDoc) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOverTarget !== targetId) setDragOverTarget(targetId);
      },
      onDragLeave: () => {
        setDragOverTarget((t) => (t === targetId ? null : t));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (draggingDoc) handleMove(draggingDoc, collectionId);
      },
    };
  }

  function collectionName(id: string | null) {
    if (!id) return "—";
    return collections.find((c) => c.id === id)?.name ?? "—";
  }

  function docCount(filter: CollectionFilter) {
    if (filter === "all") return documents.length;
    if (filter === "none") return documents.filter((d) => !d.collectionId).length;
    return documents.filter((d) => d.collectionId === filter).length;
  }

  const visibleDocuments = documents.filter((d) => {
    if (activeCollection === "all") return true;
    if (activeCollection === "none") return !d.collectionId;
    return d.collectionId === activeCollection;
  });

  const uncategorizedCount = docCount("none");
  const activeCollectionObj = collections.find((c) => c.id === activeCollection);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Документы</h1>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Dialog open={collectionDialogOpen} onOpenChange={setCollectionDialogOpen}>
              <DialogTrigger render={<Button variant="outline">Новая коллекция</Button>} />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Новая коллекция</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateCollection} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="collection-name">Название</Label>
                    <Input
                      id="collection-name"
                      required
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                      placeholder="HR, Юридический отдел, Финансы..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="collection-description">Описание (необязательно)</Label>
                    <Input
                      id="collection-description"
                      value={newCollectionDescription}
                      onChange={(e) => setNewCollectionDescription(e.target.value)}
                      placeholder="Кадровые регламенты и политики"
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={creatingCollection}>
                      {creatingCollection ? "Создаём..." : "Создать"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger render={<Button onClick={openUpload}>Загрузить документ</Button>} />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Загрузить документ</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpload} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="file">Файл (PDF, DOCX, TXT)</Label>
                    <Input id="file" type="file" ref={fileInputRef} accept=".pdf,.docx,.txt" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Коллекция</Label>
                    <Select
                      value={uploadCollection}
                      onValueChange={(v) => setUploadCollection(v ?? "none")}
                      items={{
                        none: "Без коллекции",
                        ...Object.fromEntries(collections.map((c) => [c.id, c.name])),
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Без коллекции</SelectItem>
                        {collections.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Документ будет обработан через Google Gemini API — содержимое передаётся
                    стороннему провайдеру. Не загружайте гостайну, банковскую тайну и специальные
                    категории персональных данных.
                  </p>

                  {hasUploadConsent === false && (
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-foreground"
                      />
                      <span>
                        Я принимаю{" "}
                        <Link href="/legal/terms" target="_blank" className="underline underline-offset-2">
                          Условия использования
                        </Link>{" "}
                        и{" "}
                        <Link href="/legal/privacy" target="_blank" className="underline underline-offset-2">
                          Политику конфиденциальности
                        </Link>
                        , включая передачу содержимого документов Google Gemini API.
                      </span>
                    </label>
                  )}

                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={uploading || (hasUploadConsent === false && !termsAccepted)}
                    >
                      {uploading ? "Загружаем..." : "Загрузить"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <Card
          onClick={() => setActiveCollection("all")}
          className={cn(
            "cursor-pointer py-4 transition-colors hover:border-primary/60",
            activeCollection === "all" && "border-primary bg-primary/5"
          )}
        >
          <CardContent className="flex items-center gap-3 px-4">
            <Files className="h-8 w-8 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Все документы</p>
              <p className="text-xs text-muted-foreground">{docCount("all")} документов</p>
            </div>
          </CardContent>
        </Card>

        {collections.map((c) => (
          <Card
            key={c.id}
            onClick={() => setActiveCollection(c.id)}
            {...dropTargetProps(c.id, c.id)}
            className={cn(
              "group cursor-pointer py-4 transition-colors hover:border-primary/60",
              activeCollection === c.id && "border-primary bg-primary/5",
              draggingDoc && "border-dashed",
              dragOverTarget === c.id && "border-solid border-foreground bg-accent ring-2 ring-foreground/15"
            )}
          >
            <CardContent className="flex items-center gap-3 px-4">
              {activeCollection === c.id ? (
                <FolderOpen className="h-8 w-8 shrink-0 text-foreground/70" />
              ) : (
                <Folder className="h-8 w-8 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={c.description ?? undefined}>
                  {c.name}
                </p>
                <p className="text-xs text-muted-foreground">{docCount(c.id)} документов</p>
              </div>
              {canAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                  onClick={(e) => handleDeleteCollection(e, c.id)}
                  title="Удалить коллекцию"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}

        {(uncategorizedCount > 0 || draggingDoc) && (
          <Card
            onClick={() => setActiveCollection("none")}
            {...dropTargetProps("none", null)}
            className={cn(
              "cursor-pointer py-4 transition-colors hover:border-primary/60",
              activeCollection === "none" && "border-primary bg-primary/5",
              draggingDoc && "border-dashed",
              dragOverTarget === "none" && "border-solid border-foreground bg-accent ring-2 ring-foreground/15"
            )}
          >
            <CardContent className="flex items-center gap-3 px-4">
              <Folder className="h-8 w-8 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Без коллекции</p>
                <p className="text-xs text-muted-foreground">
                  {draggingDoc ? "Перетащите сюда, чтобы убрать из коллекции" : `${uncategorizedCount} документов`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {activeCollection !== "all" && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4" />
          <span>
            Коллекция: <span className="font-medium text-foreground">{activeCollectionObj?.name ?? "Без коллекции"}</span>
            {activeCollectionObj?.description ? ` — ${activeCollectionObj.description}` : ""}
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setActiveCollection("all")}>
            Показать все
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : visibleDocuments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {activeCollection === "all" ? "Документов пока нет." : "В этой коллекции пока нет документов."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleDocuments.map((d) => {
            const type = docType({ mimeType: d.mimeType, name: d.originalName });
            const TypeIcon = type.icon;
            return (
              <Card
                key={d.id}
                data-doc-card={d.id}
                onClick={() => {
                  if (d.status !== "ready") {
                    toast.info(
                      d.status === "failed"
                        ? "Документ не был обработан — превью недоступно"
                        : "Документ ещё обрабатывается — превью появится чуть позже"
                    );
                    return;
                  }
                  setPreviewDoc({ id: d.id, name: d.originalName, mimeType: d.mimeType });
                }}
                className={cn(
                  "group cursor-pointer py-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
                  draggingDoc?.id === d.id && "opacity-50"
                )}
              >
                <CardContent className="flex h-full flex-col gap-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                        type.bg
                      )}
                    >
                      <TypeIcon className={cn("h-5 w-5", type.text)} />
                    </div>
                    <div className="flex shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                      {canManage && (
                        <button
                          type="button"
                          draggable
                          title="Перетащите карточку в коллекцию"
                          onClick={(e) => e.stopPropagation()}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.setData("text/plain", d.id);
                            e.dataTransfer.effectAllowed = "move";
                            const card = (e.target as HTMLElement).closest("[data-doc-card]");
                            if (card instanceof HTMLElement) {
                              e.dataTransfer.setDragImage(card, 24, 24);
                            }
                            setDraggingDoc(d);
                          }}
                          onDragEnd={() => {
                            setDraggingDoc(null);
                            setDragOverTarget(null);
                          }}
                          className="flex h-7 w-7 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
                        >
                          <Menu className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {d.status === "ready" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Пересказ документа (ИИ)"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSummaryDoc({ id: d.id, name: d.originalName, mimeType: d.mimeType });
                          }}
                        >
                          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Скачать оригинальный файл"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(documentsApi.downloadUrl(orgId, d.id), "_blank");
                        }}
                      >
                        <Download className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Удалить документ"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteDoc(d);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p
                      className="line-clamp-2 text-sm font-medium break-all"
                      title={d.originalName}
                    >
                      {d.originalName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {type.label} · {formatSize(d.sizeBytes)} · {formatDate(d.createdAt)}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <Badge variant={STATUS_VARIANT[d.status]} title={d.failureReason ?? undefined}>
                      {STATUS_LABELS[d.status]}
                    </Badge>
                    {d.collectionId && (
                      <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        <Folder className="h-3 w-3 shrink-0" />
                        <span className="truncate">{collectionName(d.collectionId)}</span>
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DocumentPreviewDialog orgId={orgId} target={previewDoc} onClose={() => setPreviewDoc(null)} />
      <DocumentSummaryDialog orgId={orgId} target={summaryDoc} onClose={() => setSummaryDoc(null)} />

      <Dialog open={!!deleteDoc} onOpenChange={(open) => !open && !deleting && setDeleteDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить документ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            «{deleteDoc?.originalName}» будет удалён безвозвратно вместе с данными для поиска — ИИ
            перестанет использовать его в ответах.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDoc(null)} disabled={deleting}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Удаляем..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
