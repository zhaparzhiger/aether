import { db } from "../config/db";
import { activityLog } from "../db/schema";

export type ActivityAction =
  | "chat_question"
  | "document_upload"
  | "document_delete"
  | "document_download"
  | "summary_generate";

/**
 * Fire-and-forget audit logging: activity must never break the main flow,
 * so failures are only reported to the console.
 */
export function logActivity(entry: {
  organizationId: string;
  userId: string;
  action: ActivityAction;
  documentId?: string;
  chatId?: string;
  metadata?: Record<string, string>;
}): void {
  db.insert(activityLog)
    .values({
      organizationId: entry.organizationId,
      userId: entry.userId,
      action: entry.action,
      documentId: entry.documentId ?? null,
      chatId: entry.chatId ?? null,
      metadata: entry.metadata ?? null,
    })
    .catch((err) => console.error("Failed to write activity log:", err));
}
