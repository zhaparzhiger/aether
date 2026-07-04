"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wand2, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { documentsApi, generateApi, DocumentItem, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { hasRole } from "@/lib/roles";

export default function GeneratePage() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg!.organizationId;
  const canGenerate = hasRole(currentOrg?.role, "manager");

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [templateId, setTemplateId] = useState<string>("none");
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);

  useEffect(() => {
    documentsApi
      .list(orgId)
      .then((res) => setDocuments(res.documents.filter((d) => d.status === "ready")))
      .catch(() => undefined);
  }, [orgId]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!instructions.trim() || generating) return;
    setGenerating(true);
    try {
      const result = await generateApi.generate(orgId, {
        templateDocumentId: templateId === "none" ? undefined : templateId,
        instructions: instructions.trim(),
      });
      setTitle(result.title);
      setContent(result.content);
      toast.success("Документ сгенерирован — проверьте и при необходимости отредактируйте");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сгенерировать документ");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload(format: "pdf" | "docx") {
    if (!content.trim()) return;
    setDownloading(format);
    try {
      await generateApi.download(orgId, { title: title || "Документ", content, format });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось скачать документ");
    } finally {
      setDownloading(null);
    }
  }

  if (!canGenerate) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-semibold">Генерация документов</h1>
        <p className="text-sm text-muted-foreground">
          Генерация документов доступна ролям Менеджер и выше.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Генерация документов</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Новый документ
          </CardTitle>
          <CardDescription>
            Выберите загруженный документ-шаблон (необязательно) и опишите, что нужно создать.
            Пример: «Создай приказ о приёме на работу: Иванов Иван Иванович, инженер, с 1 августа
            2026, оклад 450 000 тг».
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="space-y-2">
              <Label>Шаблон</Label>
              <Select
                value={templateId}
                onValueChange={(v) => setTemplateId(v ?? "none")}
                items={{
                  none: "Без шаблона",
                  ...Object.fromEntries(documents.map((d) => [d.id, d.originalName])),
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без шаблона</SelectItem>
                  {documents.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.originalName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructions">Что создать</Label>
              <Textarea
                id="instructions"
                required
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Создай приказ о приёме на работу по шаблону: сотрудник Иванов Иван Иванович..."
                className="min-h-[90px]"
              />
            </div>
            <Button type="submit" disabled={generating || !instructions.trim()} className="gap-2">
              <Wand2 className="h-4 w-4" />
              {generating ? "Генерируем..." : "Сгенерировать"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {content && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Результат
            </CardTitle>
            <CardDescription>Текст можно отредактировать перед скачиванием.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doc-title">Название файла</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => handleDownload("docx")}
                disabled={downloading !== null}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {downloading === "docx" ? "Скачиваем..." : "Скачать Word (DOCX)"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleDownload("pdf")}
                disabled={downloading !== null}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {downloading === "pdf" ? "Скачиваем..." : "Скачать PDF"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
