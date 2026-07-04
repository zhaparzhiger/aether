"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Folder, FolderOpen, Files, Trash2 } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { collectionsApi, documentsApi, Collection, DocumentItem, DocumentStatus, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { hasRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

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

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCollection, setUploadCollection] = useState<string>("none");
  const [uploading, setUploading] = useState(false);
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
    setUploading(true);
    try {
      await documentsApi.upload(orgId, file, uploadCollection === "none" ? undefined : uploadCollection);
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

  async function handleDelete(id: string) {
    try {
      await documentsApi.remove(orgId, id);
      toast.success("Документ удалён");
      loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось удалить документ");
    }
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
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Документы</h1>
        {canManage && (
          <div className="flex gap-2">
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
                  <DialogFooter>
                    <Button type="submit" disabled={uploading}>
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
            className={cn(
              "group cursor-pointer py-4 transition-colors hover:border-primary/60",
              activeCollection === c.id && "border-primary bg-primary/5"
            )}
          >
            <CardContent className="flex items-center gap-3 px-4">
              {activeCollection === c.id ? (
                <FolderOpen className="h-8 w-8 shrink-0 text-amber-500" />
              ) : (
                <Folder className="h-8 w-8 shrink-0 text-amber-500" />
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
                  className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => handleDeleteCollection(e, c.id)}
                  title="Удалить коллекцию"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}

        {uncategorizedCount > 0 && (
          <Card
            onClick={() => setActiveCollection("none")}
            className={cn(
              "cursor-pointer py-4 transition-colors hover:border-primary/60",
              activeCollection === "none" && "border-primary bg-primary/5"
            )}
          >
            <CardContent className="flex items-center gap-3 px-4">
              <Folder className="h-8 w-8 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Без коллекции</p>
                <p className="text-xs text-muted-foreground">{uncategorizedCount} документов</p>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Файл</TableHead>
              <TableHead>Коллекция</TableHead>
              <TableHead>Размер</TableHead>
              <TableHead>Статус</TableHead>
              {canManage && <TableHead className="text-right">Действия</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleDocuments.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.originalName}</TableCell>
                <TableCell>{collectionName(d.collectionId)}</TableCell>
                <TableCell>{formatSize(d.sizeBytes)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[d.status]} title={d.failureReason ?? undefined}>
                    {STATUS_LABELS[d.status]}
                  </Badge>
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(d.id)}>
                      Удалить
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
