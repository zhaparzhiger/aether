"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { DISCLAIMER_TEXT, LEGAL_VERSION } from "@/lib/legal";

function storageKey(userId: string) {
  return `aether-disclaimer-dismissed:${userId}:v${LEGAL_VERSION}`;
}

export function DisclaimerBanner() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    try {
      setVisible(localStorage.getItem(storageKey(user.id)) !== "1");
    } catch {
      setVisible(true);
    }
  }, [user]);

  if (!visible || !user) return null;

  function dismiss() {
    try {
      localStorage.setItem(storageKey(user!.id), "1");
    } catch {
      // storage unavailable — the banner will reappear next session
    }
    setVisible(false);
  }

  return (
    <div className="flex items-center gap-2.5 border-b bg-muted/60 px-4 py-2 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5 shrink-0" />
      <p className="min-w-0 flex-1">
        {DISCLAIMER_TEXT}{" "}
        <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
          Подробнее
        </Link>
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={dismiss}
        title="Скрыть уведомление"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
