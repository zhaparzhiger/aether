"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { chatApi, Chat, ChatScope, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { hasRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

const SCOPE_EMPTY: Record<ChatScope, string> = {
  mine: "Чатов пока нет",
  shared: "Важных чатов пока нет — отметьте чат звёздочкой, и его увидит вся команда",
  all: "В организации пока нет чатов",
};

export function ChatList() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg!.organizationId;
  const isAdmin = hasRole(currentOrg?.role, "admin");
  const pathname = usePathname();
  const router = useRouter();
  const [scope, setScope] = useState<ChatScope>("mine");
  const [chats, setChats] = useState<Chat[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (s: ChatScope) => {
    try {
      const { chats } = await chatApi.list(orgId, s);
      setChats(chats);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить чаты");
    }
  }, [orgId]);

  useEffect(() => {
    load(scope);
  }, [load, scope]);

  async function handleNewChat() {
    setCreating(true);
    try {
      const { chat } = await chatApi.create(orgId);
      setScope("mine");
      setChats((prev) => (scope === "mine" ? [chat, ...prev] : prev));
      router.push(`/dashboard/chat/${chat.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать чат");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r">
      <div className="space-y-2 border-b p-3">
        <Button className="w-full gap-2" size="sm" onClick={handleNewChat} disabled={creating}>
          <Plus className="h-4 w-4" />
          Новый чат
        </Button>
        <Tabs value={scope} onValueChange={(v) => setScope(v as ChatScope)}>
          <TabsList className="w-full">
            <TabsTrigger value="mine" className="flex-1 text-xs">
              Мои
            </TabsTrigger>
            <TabsTrigger value="shared" className="flex-1 text-xs">
              Важные
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="all" className="flex-1 text-xs">
                Все
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {chats.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/chat/${c.id}`}
              className={cn(
                "block rounded-md px-3 py-2 text-sm",
                pathname === `/dashboard/chat/${c.id}`
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span className="flex items-center gap-1.5">
                {c.isShared && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                <span className="truncate">{c.title}</span>
              </span>
              {scope !== "mine" && c.authorName && (
                <span className="block truncate text-xs opacity-70">{c.authorName}</span>
              )}
            </Link>
          ))}
          {chats.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">{SCOPE_EMPTY[scope]}</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
