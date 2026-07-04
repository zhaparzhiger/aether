import { MessageSquare } from "lucide-react";

export default function ChatIndexPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
      <MessageSquare className="h-10 w-10" />
      <p>Выберите чат слева или создайте новый</p>
    </div>
  );
}
