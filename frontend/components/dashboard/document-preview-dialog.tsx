"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { documentsApi, DocumentPage, ApiError } from "@/lib/api";
import { docType } from "@/lib/doc-type";
import { cn } from "@/lib/utils";

export interface PreviewTarget {
  id: string;
  name: string;
  mimeType?: string | null;
}

const PAGE_BATCH = 10;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function DocumentPreviewDialog({
  orgId,
  target,
  onClose,
}: {
  orgId: string;
  target: PreviewTarget | null;
  onClose: () => void;
}) {
  const [pages, setPages] = useState<DocumentPage[] | null>(null);
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setPages(null);
    setSizeBytes(null);
    setHasMore(false);
    setError(null);
    documentsApi
      .content(orgId, target.id, { offset: 0, limit: PAGE_BATCH })
      .then((res) => {
        if (cancelled) return;
        setPages(res.pages);
        setSizeBytes(res.document.sizeBytes);
        setTotalPages(res.totalPages);
        setHasMore(res.hasMore);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Не удалось загрузить документ");
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, target]);

  async function loadMore() {
    if (!target || !pages || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await documentsApi.content(orgId, target.id, {
        offset: pages.length,
        limit: PAGE_BATCH,
      });
      setPages((prev) => [...(prev ?? []), ...res.pages]);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить продолжение");
    } finally {
      setLoadingMore(false);
    }
  }

  const type = docType({ mimeType: target?.mimeType, name: target?.name });
  const TypeIcon = type.icon;

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 pr-8">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                type.bg
              )}
            >
              <TypeIcon className={cn("h-5 w-5", type.text)} />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{target?.name}</DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {type.label}
                {sizeBytes !== null ? ` · ${formatSize(sizeBytes)}` : ""}
                {totalPages > 1 ? ` · ${totalPages} стр.` : ""}
              </p>
            </div>
            {target && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => window.open(documentsApi.downloadUrl(orgId, target.id), "_blank")}
                title="Скачать оригинальный файл"
              >
                <Download className="h-3.5 w-3.5" />
                Скачать
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-lg border bg-muted/30 p-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !pages ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем содержимое...
            </div>
          ) : pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Документ пуст.</p>
          ) : (
            <div className="space-y-4">
              {pages.map((p, i) => (
                <div key={i}>
                  {p.pageNumber !== null && (
                    <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Страница {p.pageNumber}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{p.text}</p>
                </div>
              ))}
              {hasMore && (
                <div className="flex justify-center pt-1">
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Загружаем...
                      </>
                    ) : (
                      `Показать ещё (${pages.length} из ${totalPages})`
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
