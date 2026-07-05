import { Router } from "express";
import { eq, and, desc, asc, gte, lte, sql, SQL } from "drizzle-orm";
import { db } from "../config/db";
import {
  activityLog,
  chats,
  documents,
  messages,
  organizationMembers,
  users,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireOrgRole } from "../middleware/requireRole";

const router = Router();

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function maxDate(...dates: (Date | null)[]): Date | null {
  let max: Date | null = null;
  for (const d of dates) {
    if (d && (!max || d > max)) max = d;
  }
  return max;
}

// per-member aggregates for the team activity dashboard
router.get(
  "/:orgId/activity/members",
  requireAuth,
  requireOrgRole("manager"),
  async (req, res, next) => {
    try {
      const orgId = req.params.orgId;

      const members = await db
        .select({
          userId: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
          role: organizationMembers.role,
        })
        .from(organizationMembers)
        .innerJoin(users, eq(users.id, organizationMembers.userId))
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.status, "active")
          )
        );

      const questionRows = await db
        .select({
          userId: chats.userId,
          count: sql<number>`count(*)::int`,
          last: sql<Date>`max(${messages.createdAt})`,
        })
        .from(messages)
        .innerJoin(chats, eq(chats.id, messages.chatId))
        .where(and(eq(chats.organizationId, orgId), eq(messages.role, "user")))
        .groupBy(chats.userId);

      const uploadRows = await db
        .select({
          userId: documents.uploadedBy,
          count: sql<number>`count(*)::int`,
          last: sql<Date>`max(${documents.createdAt})`,
        })
        .from(documents)
        .where(eq(documents.organizationId, orgId))
        .groupBy(documents.uploadedBy);

      const downloadRows = await db
        .select({
          userId: activityLog.userId,
          count: sql<number>`count(*)::int`,
        })
        .from(activityLog)
        .where(and(eq(activityLog.organizationId, orgId), eq(activityLog.action, "document_download")))
        .groupBy(activityLog.userId);

      const lastLogRows = await db
        .select({
          userId: activityLog.userId,
          last: sql<Date>`max(${activityLog.createdAt})`,
        })
        .from(activityLog)
        .where(eq(activityLog.organizationId, orgId))
        .groupBy(activityLog.userId);

      const questionMap = new Map(questionRows.map((r) => [r.userId, r]));
      const uploadMap = new Map(uploadRows.map((r) => [r.userId, r]));
      const downloadMap = new Map(downloadRows.map((r) => [r.userId, r.count]));
      const lastLogMap = new Map(lastLogRows.map((r) => [r.userId, r.last]));

      const result = members.map((m) => {
        const q = questionMap.get(m.userId);
        const u = uploadMap.get(m.userId);
        const lastActivity = maxDate(
          q?.last ? new Date(q.last) : null,
          u?.last ? new Date(u.last) : null,
          lastLogMap.get(m.userId) ? new Date(lastLogMap.get(m.userId)!) : null
        );
        return {
          userId: m.userId,
          name: m.name,
          email: m.email,
          avatarUrl: m.avatarUrl,
          role: m.role,
          questions: q?.count ?? 0,
          uploads: u?.count ?? 0,
          downloads: downloadMap.get(m.userId) ?? 0,
          lastActivity,
        };
      });

      res.json({ members: result });
    } catch (err) {
      next(err);
    }
  }
);

// filtered audit log (uploads / deletions / downloads / questions / summaries)
router.get(
  "/:orgId/activity/log",
  requireAuth,
  requireOrgRole("manager"),
  async (req, res, next) => {
    try {
      const conditions: SQL[] = [eq(activityLog.organizationId, req.params.orgId)];

      if (typeof req.query.userId === "string" && req.query.userId) {
        conditions.push(eq(activityLog.userId, req.query.userId));
      }
      if (typeof req.query.action === "string" && req.query.action) {
        conditions.push(eq(activityLog.action, req.query.action));
      }
      const from = parseDate(req.query.from);
      if (from) conditions.push(gte(activityLog.createdAt, from));
      const to = parseDate(req.query.to);
      if (to) conditions.push(lte(activityLog.createdAt, to));

      const rows = await db
        .select({
          id: activityLog.id,
          action: activityLog.action,
          documentId: activityLog.documentId,
          chatId: activityLog.chatId,
          metadata: activityLog.metadata,
          createdAt: activityLog.createdAt,
          userId: activityLog.userId,
          userName: users.name,
        })
        .from(activityLog)
        .innerJoin(users, eq(users.id, activityLog.userId))
        .where(and(...conditions))
        .orderBy(desc(activityLog.createdAt))
        .limit(200);

      res.json({ entries: rows });
    } catch (err) {
      next(err);
    }
  }
);

// question → answer history of one member (their own chats in this org)
router.get(
  "/:orgId/activity/questions",
  requireAuth,
  requireOrgRole("manager"),
  async (req, res, next) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId : "";
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const conditions: SQL[] = [
        eq(chats.organizationId, req.params.orgId),
        eq(chats.userId, userId),
      ];
      const from = parseDate(req.query.from);
      if (from) conditions.push(gte(messages.createdAt, from));
      const to = parseDate(req.query.to);
      if (to) conditions.push(lte(messages.createdAt, to));

      const rows = await db
        .select({
          id: messages.id,
          chatId: messages.chatId,
          chatTitle: chats.title,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .innerJoin(chats, eq(chats.id, messages.chatId))
        .where(and(...conditions))
        .orderBy(asc(messages.createdAt));

      // pair each user question with the next assistant reply in the same chat
      const pairs: {
        question: string;
        answer: string | null;
        chatId: string;
        chatTitle: string;
        askedAt: Date;
      }[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.role !== "user") continue;
        let answer: string | null = null;
        for (let j = i + 1; j < rows.length; j++) {
          if (rows[j].chatId !== row.chatId) continue;
          if (rows[j].role === "assistant") {
            answer = rows[j].content;
          }
          break;
        }
        pairs.push({
          question: row.content,
          answer,
          chatId: row.chatId,
          chatTitle: row.chatTitle,
          askedAt: row.createdAt,
        });
      }

      pairs.reverse(); // newest first
      res.json({ questions: pairs.slice(0, 100) });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
