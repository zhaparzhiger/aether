"use client";

import { usePathname } from "next/navigation";
import { ChatList } from "@/components/dashboard/chat-list";
import { cn } from "@/lib/utils";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // на мобильном показываем либо список чатов, либо открытый тред
  const threadOpen = pathname !== "/dashboard/chat";

  return (
    <div className="flex min-h-0 flex-1">
      <ChatList className={cn(threadOpen && "hidden md:flex")} />
      <div className={cn("min-w-0 flex-1 flex-col", threadOpen ? "flex" : "hidden md:flex")}>
        {children}
      </div>
    </div>
  );
}
