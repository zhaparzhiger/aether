"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setPages(null);
    setSizeBytes(null);
    setError(null);
    setTruncated(false);
    documentsApi
      .content(orgId, target.id)
      .then((res) => {
        if (cancelled) return;
        setPages(res.pages);
        setSizeBytes(res.document.sizeBytes);
        setTruncated(res.truncated);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Не удалось загрузить документ");
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, target]);

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
            <div className="min-w-0">
              <DialogTitle className="truncate">{target?.name}</DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {type.label}
                {sizeBytes !== null ? ` · ${formatSize(sizeBytes)}` : ""}
              </p>
            </div>
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
              {truncated && (
                <p className="pt-2 text-xs text-muted-foreground italic">
                  Документ слишком большой — показано начало.
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
