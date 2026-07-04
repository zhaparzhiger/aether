import { ChatList } from "@/components/dashboard/chat-list";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      <ChatList />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
