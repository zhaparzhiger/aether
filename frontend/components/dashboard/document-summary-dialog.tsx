"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { documentsApi, ApiError } from "@/lib/api";
import { docType } from "@/lib/doc-type";
import { cn } from "@/lib/utils";

export interface SummaryTarget {
  id: string;
  name: string;
  mimeType?: string | null;
}

interface SummaryState {
  summary: string;
  generatedAt: string | null;
}

export function DocumentSummaryDialog({
  orgId,
  target,
  onClose,
}: {
  orgId: string;
  target: SummaryTarget | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<SummaryState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(id: string, refresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await documentsApi.summary(orgId, id, refresh);
      setState({ summary: res.summary, generatedAt: res.generatedAt });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сгенерировать пересказ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!target) return;
    setState(null);
    generate(target.id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, target]);

  const type = docType({ mimeType: target?.mimeType, name: target?.name });
  const TypeIcon = type.icon;

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3 pr-8">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                type.bg
              )}
            >
              <Sparkles className={cn("h-5 w-5", type.text)} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate">Пересказ: {target?.name}</DialogTitle>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <TypeIcon className="h-3 w-3" />
                {state?.generatedAt
                  ? `Сгенерирован ${new Date(state.generatedAt).toLocaleString("ru-RU", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "Краткое содержание документа"}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto rounded-lg border bg-muted/30 p-4">
          {loading ? (
            <div className="animate-pulse space-y-3" aria-label="Генерируем пересказ">
              <div className="h-3.5 w-full rounded bg-foreground/10" />
              <div className="h-3.5 w-11/12 rounded bg-foreground/10" />
              <div className="h-3.5 w-4/5 rounded bg-foreground/10" />
              <div className="h-3.5 w-2/3 rounded bg-foreground/[0.07]" />
              <div className="pt-2" />
              <div className="h-3.5 w-3/4 rounded bg-foreground/[0.07]" />
              <div className="h-3.5 w-5/6 rounded bg-foreground/[0.07]" />
              <p className="pt-1 text-xs text-muted-foreground">
                Генерируем пересказ — обычно занимает несколько секунд...
              </p>
            </div>
          ) : error ? (
            <div className="space-y-3 py-2 text-center">
              <p className="text-sm text-destructive">{error}</p>
              {target && (
                <Button variant="outline" size="sm" onClick={() => generate(target.id, false)}>
                  Попробовать ещё раз
                </Button>
              )}
            </div>
          ) : state ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{state.summary}</p>
          ) : null}
        </div>

        {state && !loading && target && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => generate(target.id, true)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Обновить пересказ
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
